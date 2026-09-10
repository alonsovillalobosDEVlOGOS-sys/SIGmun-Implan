-- Respaldo/versionado de la función aplicada en producción.
-- La migración ya fue aplicada en Supabase; no es necesario ejecutarla otra vez.

create or replace function public.sigmun_geo_layer_mvt_v3(
  p_layer_id uuid,
  p_z integer,
  p_x integer,
  p_y integer,
  p_feature_limit integer default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_metadata jsonb := '{}'::jsonb;
  v_style jsonb := '{}'::jsonb;
  v_is_public boolean := false;
  v_min_zoom integer := 0;
  v_cap integer;
  v_limit integer;
  v_mvt bytea := ''::bytea;
  v_style_field text;
  v_height_field text;
  v_base_field text;
  v_band_field text;
begin
  if p_z is null or p_x is null or p_y is null or p_z < 0 or p_z > 22 then return ''; end if;

  select geometry_type, coalesce(metadata,'{}'::jsonb), coalesce(style,'{}'::jsonb), coalesce(is_public,false)
    into v_type, v_metadata, v_style, v_is_public
  from public.sigmun_geo_layers
  where id = p_layer_id;

  if not found then return ''; end if;
  if not v_is_public and not coalesce(private.sigmun_can_edit(),false) then return ''; end if;

  if coalesce(v_metadata->>'mvt_min_zoom','') ~ '^\d+$' then v_min_zoom := (v_metadata->>'mvt_min_zoom')::integer;
  elsif coalesce(v_metadata->>'min_zoom','') ~ '^\d+$' then v_min_zoom := (v_metadata->>'min_zoom')::integer;
  end if;
  v_min_zoom := greatest(0, least(22, v_min_zoom));
  if p_z < v_min_zoom then return ''; end if;

  v_cap := case when p_z <= 13 then 1200 when p_z = 14 then 1800 when p_z = 15 then 6000 when p_z = 16 then 3500 else 2500 end;
  v_limit := greatest(200, least(coalesce(p_feature_limit, v_cap), v_cap));
  v_style_field := nullif(v_style->>'field','');
  v_height_field := coalesce(nullif(v_style->'threeD'->>'heightField',''), nullif(v_metadata->'three_d'->>'height_field',''), 'ALTURA_M');
  v_base_field := coalesce(nullif(v_style->'threeD'->>'baseHeightField',''), nullif(v_metadata->'three_d'->>'base_height_field',''), 'ALTURA_BASE_M');
  v_band_field := coalesce(nullif(v_style->'threeD'->>'bandField',''), nullif(v_metadata->'three_d'->>'band_field',''), 'RANGO_ALTURA');

  if v_type = 'MultiPolygon' then
    with bounds as (select public.st_tileenvelope(p_z,p_x,p_y) env3857),
    b as (select env3857, public.st_transform(env3857,4326) env4326 from bounds),
    candidates as materialized (
      select q.id,q.attributes,q.multipolygon,b.env3857 from public.sigmun_geo_polygons q cross join b
      where q.layer_id=p_layer_id and q.multipolygon OPERATOR(public.&&) b.env4326 limit v_limit
    ), rows as (
      select jsonb_strip_nulls(jsonb_build_object('_sigmun_id',id::text,'_sigmun_layer_id',p_layer_id::text)
        || case when v_style_field is not null then jsonb_build_object(v_style_field,attributes->v_style_field) else '{}'::jsonb end
        || jsonb_build_object(v_height_field,attributes->v_height_field,v_base_field,attributes->v_base_field,v_band_field,attributes->v_band_field)) props,
        public.st_asmvtgeom(public.st_transform(public.st_force2d(multipolygon),3857),env3857,4096,32,true) geom
      from candidates
    ) select coalesce(public.st_asmvt(rows,'sigmun',4096,'geom'),'') into v_mvt from rows where geom is not null;
  elsif v_type = 'MultiLineString' then
    with bounds as (select public.st_tileenvelope(p_z,p_x,p_y) env3857),
    b as (select env3857, public.st_transform(env3857,4326) env4326 from bounds),
    candidates as materialized (
      select q.id,q.attributes,q.multiline,b.env3857 from public.sigmun_geo_lines q cross join b
      where q.layer_id=p_layer_id and q.multiline OPERATOR(public.&&) b.env4326 limit v_limit
    ), rows as (
      select jsonb_strip_nulls(jsonb_build_object('_sigmun_id',id::text,'_sigmun_layer_id',p_layer_id::text)
        || case when v_style_field is not null then jsonb_build_object(v_style_field,attributes->v_style_field) else '{}'::jsonb end
        || jsonb_build_object('_kml_line_color',attributes->'_kml_line_color')) props,
        public.st_asmvtgeom(public.st_transform(public.st_force2d(multiline),3857),env3857,4096,32,true) geom
      from candidates
    ) select coalesce(public.st_asmvt(rows,'sigmun',4096,'geom'),'') into v_mvt from rows where geom is not null;
  elsif v_type = 'Point' then
    with bounds as (select public.st_tileenvelope(p_z,p_x,p_y) env3857),
    b as (select env3857, public.st_transform(env3857,4326) env4326 from bounds),
    candidates as materialized (
      select q.id,q.attributes,q.geom,b.env3857 from public.sigmun_geo_points q cross join b
      where q.layer_id=p_layer_id and q.geom OPERATOR(public.&&) b.env4326 limit v_limit
    ), rows as (
      select jsonb_strip_nulls(jsonb_build_object('_sigmun_id',id::text,'_sigmun_layer_id',p_layer_id::text)
        || case when v_style_field is not null then jsonb_build_object(v_style_field,attributes->v_style_field) else '{}'::jsonb end) props,
        public.st_asmvtgeom(public.st_transform(public.st_force2d(geom),3857),env3857,4096,32,true) geom
      from candidates
    ) select coalesce(public.st_asmvt(rows,'sigmun',4096,'geom'),'') into v_mvt from rows where geom is not null;
  else return '';
  end if;

  return encode(coalesce(v_mvt,''::bytea),'base64');
end;
$$;

revoke all on function public.sigmun_geo_layer_mvt_v3(uuid,integer,integer,integer,integer) from public;
grant execute on function public.sigmun_geo_layer_mvt_v3(uuid,integer,integer,integer,integer) to anon, authenticated;
