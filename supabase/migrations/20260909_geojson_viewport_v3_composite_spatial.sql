create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create index if not exists sigmun_geo_polygons_layer_geom_gix
  on public.sigmun_geo_polygons using gist (layer_id extensions.gist_uuid_ops, multipolygon);
create index if not exists sigmun_geo_lines_layer_geom_gix
  on public.sigmun_geo_lines using gist (layer_id extensions.gist_uuid_ops, multiline);
create index if not exists sigmun_geo_points_layer_geom_gix
  on public.sigmun_geo_points using gist (layer_id extensions.gist_uuid_ops, geom);

create or replace function public.sigmun_geo_layer_geojson_viewport_v3(
  p_layer_id uuid,
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_limit integer default 3500,
  p_simplify double precision default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = 'public', 'extensions'
as $$
declare
  v_type text;
  v_limit integer := greatest(100, least(coalesce(p_limit,3500),6000));
  v_simplify double precision := greatest(0, least(coalesce(p_simplify,0),0.001));
  v_env geometry := st_makeenvelope(p_west,p_south,p_east,p_north,4326);
  v_features jsonb := '[]'::jsonb;
  v_returned integer := 0;
  v_has_more boolean := false;
begin
  if p_west >= p_east or p_south >= p_north then raise exception 'Invalid viewport bounds'; end if;
  select geometry_type into v_type from public.sigmun_geo_layers where id=p_layer_id;
  if not found then return jsonb_build_object('type','FeatureCollection','features','[]'::jsonb,'returned',0,'has_more',false,'engine','viewport_v3'); end if;

  if v_type='Point' then
    with candidates as materialized (
      select id,name,attributes,lat,lon,geom from public.sigmun_geo_points
      where layer_id=p_layer_id and geom && v_env limit v_limit+1
    ), clipped as (select * from candidates limit v_limit)
    select coalesce(jsonb_agg(jsonb_build_object('type','Feature','id',q.id,'geometry',st_asgeojson(q.geom,6)::jsonb,'properties',coalesce(q.attributes,'{}'::jsonb)||jsonb_build_object('name',q.name,'lat',q.lat,'lon',q.lon))),'[]'::jsonb),
           (select count(*)>v_limit from candidates)
      into v_features,v_has_more from clipped q;
  elsif v_type='MultiPolygon' then
    with candidates as materialized (
      select id,name,attributes,multipolygon from public.sigmun_geo_polygons
      where layer_id=p_layer_id and multipolygon && v_env limit v_limit+1
    ), clipped as (select * from candidates limit v_limit)
    select coalesce(jsonb_agg(jsonb_build_object('type','Feature','id',q.id,'geometry',st_asgeojson(case when v_simplify>0 then st_simplifypreservetopology(q.multipolygon,v_simplify) else q.multipolygon end,6)::jsonb,'properties',coalesce(q.attributes,'{}'::jsonb)||jsonb_build_object('name',q.name))),'[]'::jsonb),
           (select count(*)>v_limit from candidates)
      into v_features,v_has_more from clipped q;
  elsif v_type='MultiLineString' then
    with candidates as materialized (
      select id,name,attributes,multiline from public.sigmun_geo_lines
      where layer_id=p_layer_id and multiline && v_env limit v_limit+1
    ), clipped as (select * from candidates limit v_limit)
    select coalesce(jsonb_agg(jsonb_build_object('type','Feature','id',q.id,'geometry',st_asgeojson(case when v_simplify>0 then st_simplifypreservetopology(q.multiline,v_simplify) else q.multiline end,6)::jsonb,'properties',coalesce(q.attributes,'{}'::jsonb)||jsonb_build_object('name',q.name))),'[]'::jsonb),
           (select count(*)>v_limit from candidates)
      into v_features,v_has_more from clipped q;
  else
    with candidates as materialized (
      select 'p' kind,id,name,attributes,geom as g,lat,lon from public.sigmun_geo_points where layer_id=p_layer_id and geom && v_env
      union all
      select 'g',id,name,attributes,multipolygon,null::double precision,null::double precision from public.sigmun_geo_polygons where layer_id=p_layer_id and multipolygon && v_env
      union all
      select 'l',id,name,attributes,multiline,null::double precision,null::double precision from public.sigmun_geo_lines where layer_id=p_layer_id and multiline && v_env
      limit v_limit+1
    ), clipped as (select * from candidates limit v_limit)
    select coalesce(jsonb_agg(jsonb_build_object('type','Feature','id',q.id,'geometry',st_asgeojson(case when v_simplify>0 and q.kind<>'p' then st_simplifypreservetopology(q.g,v_simplify) else q.g end,6)::jsonb,'properties',coalesce(q.attributes,'{}'::jsonb)||jsonb_build_object('name',q.name)||case when q.kind='p' then jsonb_build_object('lat',q.lat,'lon',q.lon) else '{}'::jsonb end)),'[]'::jsonb),
           (select count(*)>v_limit from candidates)
      into v_features,v_has_more from clipped q;
  end if;

  v_returned:=jsonb_array_length(v_features);
  return jsonb_build_object('type','FeatureCollection','features',v_features,'returned',v_returned,'has_more',v_has_more,'limit',v_limit,'simplify',v_simplify,'engine','viewport_v3');
end;
$$;

grant execute on function public.sigmun_geo_layer_geojson_viewport_v3(uuid,double precision,double precision,double precision,double precision,integer,double precision) to anon,authenticated;
