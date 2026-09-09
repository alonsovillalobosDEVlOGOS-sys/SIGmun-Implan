-- SIGmun Delicias · Massive Layers Engine · MVT compacto
-- Reduce drásticamente el peso de cada tile: solo envía campos necesarios para
-- simbología, 3D y selección. Los atributos completos se consultan al hacer clic.

create or replace function public.sigmun_geo_layer_mvt_v1(
  p_layer_id uuid,
  p_z integer,
  p_x integer,
  p_y integer,
  p_feature_limit integer default 8000
)
returns text
language plpgsql
stable
security invoker
set search_path = public
as $function$
declare
  v_type text;
  v_metadata jsonb := '{}'::jsonb;
  v_style jsonb := '{}'::jsonb;
  v_min_zoom integer := 0;
  v_limit integer := greatest(500, least(coalesce(p_feature_limit, 8000), 12000));
  v_mvt bytea := ''::bytea;
  v_style_field text;
  v_label_field text;
  v_height_field text;
  v_base_field text;
  v_levels_field text;
  v_band_field text;
  v_area_field text;
  v_area_band_field text;
  v_source_field text;
begin
  if p_z is null or p_x is null or p_y is null or p_z < 0 or p_z > 22 then return ''; end if;

  select geometry_type,coalesce(metadata,'{}'::jsonb),coalesce(style,'{}'::jsonb),
         greatest(0,least(22,coalesce(nullif(metadata->>'min_zoom','')::integer,0)))
    into v_type,v_metadata,v_style,v_min_zoom
  from public.sigmun_geo_layers where id=p_layer_id;
  if not found or p_z<v_min_zoom then return ''; end if;

  v_style_field := nullif(v_style->>'field','');
  v_label_field := coalesce(nullif(v_style->>'labelField',''),nullif(v_style->>'label_field',''));
  v_height_field := coalesce(nullif(v_style->'threeD'->>'heightField',''),nullif(v_metadata->'three_d'->>'height_field',''),'ALTURA_M');
  v_base_field := coalesce(nullif(v_style->'threeD'->>'baseHeightField',''),nullif(v_metadata->'three_d'->>'base_height_field',''),'ALTURA_BASE_M');
  v_levels_field := coalesce(nullif(v_style->'threeD'->>'levelsField',''),nullif(v_metadata->'three_d'->>'levels_field',''),'NIVELES_EST');
  v_band_field := coalesce(nullif(v_style->'threeD'->>'bandField',''),nullif(v_metadata->'three_d'->>'band_field',''),'RANGO_ALTURA');
  v_area_field := coalesce(nullif(v_metadata->'three_d'->>'area_field',''),'AREA_M2');
  v_area_band_field := coalesce(nullif(v_metadata->'three_d'->>'area_band_field',''),'RANGO_SUPERFICIE');
  v_source_field := coalesce(nullif(v_metadata->'three_d'->>'source_field',''),'FUENTE_ALTURA');

  if v_type='MultiPolygon' then
    with b as (select st_tileenvelope(p_z,p_x,p_y) env3857),
    bounds as (select env3857,st_transform(env3857,4326) env4326 from b),
    candidates as (
      select q.id,q.name,q.attributes,q.multipolygon,bounds.env3857
      from public.sigmun_geo_polygons q cross join bounds
      where q.layer_id=p_layer_id and q.multipolygon && bounds.env4326
      order by q.id limit v_limit
    ), rows as (
      select
        jsonb_strip_nulls(
          jsonb_build_object('_sigmun_id',id::text,'_sigmun_layer_id',p_layer_id::text,'name',name)
          || case when v_style_field is not null then jsonb_build_object(v_style_field,attributes->v_style_field) else '{}'::jsonb end
          || case when v_label_field is not null then jsonb_build_object(v_label_field,attributes->v_label_field) else '{}'::jsonb end
          || jsonb_build_object(
               v_height_field,attributes->v_height_field,
               v_base_field,attributes->v_base_field,
               v_levels_field,attributes->v_levels_field,
               v_band_field,attributes->v_band_field,
               v_area_field,attributes->v_area_field,
               v_area_band_field,attributes->v_area_band_field,
               v_source_field,attributes->v_source_field,
               '_kml_style',attributes->'_kml_style',
               '_kml_fill_color',attributes->'_kml_fill_color',
               '_kml_line_color',attributes->'_kml_line_color'
             )
        ) props,
        st_asmvtgeom(st_transform(multipolygon,3857),env3857,4096,64,true) geom
      from candidates
    )
    select coalesce(st_asmvt(rows,'sigmun',4096,'geom'),'') into v_mvt from rows where geom is not null;

  elsif v_type='MultiLineString' then
    with b as (select st_tileenvelope(p_z,p_x,p_y) env3857),
    bounds as (select env3857,st_transform(env3857,4326) env4326 from b),
    candidates as (
      select q.id,q.name,q.attributes,q.multiline,bounds.env3857
      from public.sigmun_geo_lines q cross join bounds
      where q.layer_id=p_layer_id and q.multiline && bounds.env4326
      order by q.id limit v_limit
    ), rows as (
      select
        jsonb_strip_nulls(
          jsonb_build_object('_sigmun_id',id::text,'_sigmun_layer_id',p_layer_id::text,'name',name)
          || case when v_style_field is not null then jsonb_build_object(v_style_field,attributes->v_style_field) else '{}'::jsonb end
          || case when v_label_field is not null then jsonb_build_object(v_label_field,attributes->v_label_field) else '{}'::jsonb end
          || jsonb_build_object('_kml_style',attributes->'_kml_style','_kml_line_color',attributes->'_kml_line_color')
        ) props,
        st_asmvtgeom(st_transform(multiline,3857),env3857,4096,64,true) geom
      from candidates
    )
    select coalesce(st_asmvt(rows,'sigmun',4096,'geom'),'') into v_mvt from rows where geom is not null;

  elsif v_type='Point' then
    with b as (select st_tileenvelope(p_z,p_x,p_y) env3857),
    bounds as (select env3857,st_transform(env3857,4326) env4326 from b),
    candidates as (
      select q.id,q.name,q.attributes,q.lat,q.lon,q.geom,bounds.env3857
      from public.sigmun_geo_points q cross join bounds
      where q.layer_id=p_layer_id and q.geom && bounds.env4326
      order by q.id limit v_limit
    ), rows as (
      select
        jsonb_strip_nulls(
          jsonb_build_object('_sigmun_id',id::text,'_sigmun_layer_id',p_layer_id::text,'name',name,'lat',lat,'lon',lon)
          || case when v_style_field is not null then jsonb_build_object(v_style_field,attributes->v_style_field) else '{}'::jsonb end
          || case when v_label_field is not null then jsonb_build_object(v_label_field,attributes->v_label_field) else '{}'::jsonb end
          || jsonb_build_object('_kml_style',attributes->'_kml_style','_kml_fill_color',attributes->'_kml_fill_color')
        ) props,
        st_asmvtgeom(st_transform(geom,3857),env3857,4096,64,true) geom
      from candidates
    )
    select coalesce(st_asmvt(rows,'sigmun',4096,'geom'),'') into v_mvt from rows where geom is not null;
  else
    return '';
  end if;

  return encode(coalesce(v_mvt,''::bytea),'base64');
end;
$function$;

revoke execute on function public.sigmun_geo_layer_mvt_v1(uuid,integer,integer,integer,integer) from public;
grant execute on function public.sigmun_geo_layer_mvt_v1(uuid,integer,integer,integer,integer) to anon,authenticated;
