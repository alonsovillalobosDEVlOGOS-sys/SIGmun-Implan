-- SIGmun Delicias · Optimización de entrega GeoJSON para capas muy grandes
-- Evita construir ST_AsGeoJSON sobre todos los registros antes de LIMIT/OFFSET.

create index if not exists sigmun_geo_points_layer_id_id_idx
  on public.sigmun_geo_points(layer_id,id);
create index if not exists sigmun_geo_polygons_layer_id_id_idx
  on public.sigmun_geo_polygons(layer_id,id);
create index if not exists sigmun_geo_lines_layer_id_id_idx
  on public.sigmun_geo_lines(layer_id,id);

create or replace function public.sigmun_geo_layer_geojson_page_v2(
  p_layer_id uuid,
  p_limit integer default 500,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_type text;
  v_metadata jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit,500), 1000));
  v_offset integer := greatest(0, coalesce(p_offset,0));
  v_total integer := 0;
  v_features jsonb := '[]'::jsonb;
  v_returned integer := 0;
  v_cp integer := 0; v_cg integer := 0; v_cl integer := 0;
  v_poff integer := 0; v_goff integer := 0; v_loff integer := 0;
  v_ptake integer := 0; v_gtake integer := 0; v_ltake integer := 0;
  v_remaining integer := 0;
begin
  select geometry_type, coalesce(metadata,'{}'::jsonb)
    into v_type, v_metadata
  from public.sigmun_geo_layers
  where id = p_layer_id;

  if not found then
    return jsonb_build_object('type','FeatureCollection','features','[]'::jsonb,'total',0,'offset',v_offset,'limit',v_limit,'returned',0,'has_more',false);
  end if;

  if coalesce(v_metadata->>'feature_count','') ~ '^\d+$' then
    v_total := (v_metadata->>'feature_count')::integer;
  end if;

  if v_type = 'Point' then
    if v_total <= 0 then select count(*)::integer into v_total from public.sigmun_geo_points where layer_id=p_layer_id; end if;
    select coalesce(jsonb_agg(feature order by sort_key),'[]'::jsonb)
      into v_features
    from (
      select q.id::text sort_key,
             jsonb_build_object(
               'type','Feature','id',q.id,
               'geometry',st_asgeojson(q.geom)::jsonb,
               'properties',coalesce(q.attributes,'{}'::jsonb)||jsonb_build_object('name',q.name,'lat',q.lat,'lon',q.lon)
             ) feature
      from (
        select id,name,attributes,lat,lon,geom
        from public.sigmun_geo_points
        where layer_id=p_layer_id
        order by id
        limit v_limit offset v_offset
      ) q
    ) s;

  elsif v_type = 'MultiPolygon' then
    if v_total <= 0 then select count(*)::integer into v_total from public.sigmun_geo_polygons where layer_id=p_layer_id; end if;
    select coalesce(jsonb_agg(feature order by sort_key),'[]'::jsonb)
      into v_features
    from (
      select q.id::text sort_key,
             jsonb_build_object(
               'type','Feature','id',q.id,
               'geometry',st_asgeojson(q.multipolygon)::jsonb,
               'properties',coalesce(q.attributes,'{}'::jsonb)||jsonb_build_object('name',q.name)
             ) feature
      from (
        select id,name,attributes,multipolygon
        from public.sigmun_geo_polygons
        where layer_id=p_layer_id
        order by id
        limit v_limit offset v_offset
      ) q
    ) s;

  elsif v_type = 'MultiLineString' then
    if v_total <= 0 then select count(*)::integer into v_total from public.sigmun_geo_lines where layer_id=p_layer_id; end if;
    select coalesce(jsonb_agg(feature order by sort_key),'[]'::jsonb)
      into v_features
    from (
      select q.id::text sort_key,
             jsonb_build_object(
               'type','Feature','id',q.id,
               'geometry',st_asgeojson(q.multiline)::jsonb,
               'properties',coalesce(q.attributes,'{}'::jsonb)||jsonb_build_object('name',q.name)
             ) feature
      from (
        select id,name,attributes,multiline
        from public.sigmun_geo_lines
        where layer_id=p_layer_id
        order by id
        limit v_limit offset v_offset
      ) q
    ) s;

  else
    -- Mixed: calcula la página global sin serializar las geometrías fuera de la página solicitada.
    select count(*)::integer into v_cp from public.sigmun_geo_points where layer_id=p_layer_id;
    select count(*)::integer into v_cg from public.sigmun_geo_polygons where layer_id=p_layer_id;
    select count(*)::integer into v_cl from public.sigmun_geo_lines where layer_id=p_layer_id;
    v_total := v_cp + v_cg + v_cl;

    v_remaining := v_limit;
    if v_offset < v_cp then
      v_poff := v_offset;
      v_ptake := least(v_remaining, v_cp-v_poff);
      v_remaining := v_remaining-v_ptake;
    end if;
    if v_remaining > 0 and v_offset < v_cp+v_cg then
      v_goff := greatest(v_offset-v_cp,0);
      v_gtake := least(v_remaining, v_cg-v_goff);
      v_remaining := v_remaining-v_gtake;
    end if;
    if v_remaining > 0 and v_offset < v_total then
      v_loff := greatest(v_offset-v_cp-v_cg,0);
      v_ltake := least(v_remaining, v_cl-v_loff);
    end if;

    select coalesce(jsonb_agg(feature order by sort_key),'[]'::jsonb)
      into v_features
    from (
      select 'p:'||q.id::text sort_key,
             jsonb_build_object('type','Feature','id',q.id,'geometry',st_asgeojson(q.geom)::jsonb,'properties',coalesce(q.attributes,'{}'::jsonb)||jsonb_build_object('name',q.name,'lat',q.lat,'lon',q.lon)) feature
      from (select id,name,attributes,lat,lon,geom from public.sigmun_geo_points where layer_id=p_layer_id order by id limit v_ptake offset v_poff) q
      union all
      select 'g:'||q.id::text,
             jsonb_build_object('type','Feature','id',q.id,'geometry',st_asgeojson(q.multipolygon)::jsonb,'properties',coalesce(q.attributes,'{}'::jsonb)||jsonb_build_object('name',q.name))
      from (select id,name,attributes,multipolygon from public.sigmun_geo_polygons where layer_id=p_layer_id order by id limit v_gtake offset v_goff) q
      union all
      select 'l:'||q.id::text,
             jsonb_build_object('type','Feature','id',q.id,'geometry',st_asgeojson(q.multiline)::jsonb,'properties',coalesce(q.attributes,'{}'::jsonb)||jsonb_build_object('name',q.name))
      from (select id,name,attributes,multiline from public.sigmun_geo_lines where layer_id=p_layer_id order by id limit v_ltake offset v_loff) q
    ) s;
  end if;

  v_returned := jsonb_array_length(v_features);
  return jsonb_build_object(
    'type','FeatureCollection','features',v_features,
    'total',v_total,'offset',v_offset,'limit',v_limit,
    'returned',v_returned,'has_more',(v_offset+v_returned)<v_total,
    'engine','page_v2'
  );
end;
$$;

grant execute on function public.sigmun_geo_layer_geojson_page_v2(uuid,integer,integer) to anon, authenticated;

-- Página por viewport para capas masivas (edificios, frentes, lotes, etc.).
create or replace function public.sigmun_geo_layer_geojson_bbox_page_v2(
  p_layer_id uuid,
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_limit integer default 500,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_type text;
  v_limit integer := greatest(1, least(coalesce(p_limit,500),1000));
  v_offset integer := greatest(0,coalesce(p_offset,0));
  v_env geometry := st_makeenvelope(p_west,p_south,p_east,p_north,4326);
  v_features jsonb := '[]'::jsonb;
  v_returned integer := 0;
begin
  select geometry_type into v_type from public.sigmun_geo_layers where id=p_layer_id;
  if not found then
    return jsonb_build_object('type','FeatureCollection','features','[]'::jsonb,'returned',0,'has_more',false,'engine','bbox_v2');
  end if;

  if v_type='Point' then
    select coalesce(jsonb_agg(feature order by sort_key),'[]'::jsonb) into v_features
    from (
      select q.id::text sort_key,
             jsonb_build_object('type','Feature','id',q.id,'geometry',st_asgeojson(q.geom)::jsonb,'properties',coalesce(q.attributes,'{}'::jsonb)||jsonb_build_object('name',q.name,'lat',q.lat,'lon',q.lon)) feature
      from (
        select id,name,attributes,lat,lon,geom from public.sigmun_geo_points
        where layer_id=p_layer_id and geom && v_env
        order by id limit v_limit offset v_offset
      ) q
    ) s;
  elsif v_type='MultiPolygon' then
    select coalesce(jsonb_agg(feature order by sort_key),'[]'::jsonb) into v_features
    from (
      select q.id::text sort_key,
             jsonb_build_object('type','Feature','id',q.id,'geometry',st_asgeojson(q.multipolygon)::jsonb,'properties',coalesce(q.attributes,'{}'::jsonb)||jsonb_build_object('name',q.name)) feature
      from (
        select id,name,attributes,multipolygon from public.sigmun_geo_polygons
        where layer_id=p_layer_id and multipolygon && v_env
        order by id limit v_limit offset v_offset
      ) q
    ) s;
  elsif v_type='MultiLineString' then
    select coalesce(jsonb_agg(feature order by sort_key),'[]'::jsonb) into v_features
    from (
      select q.id::text sort_key,
             jsonb_build_object('type','Feature','id',q.id,'geometry',st_asgeojson(q.multiline)::jsonb,'properties',coalesce(q.attributes,'{}'::jsonb)||jsonb_build_object('name',q.name)) feature
      from (
        select id,name,attributes,multiline from public.sigmun_geo_lines
        where layer_id=p_layer_id and multiline && v_env
        order by id limit v_limit offset v_offset
      ) q
    ) s;
  else
    -- Las capas Mixed normalmente son pequeñas; limita la serialización a los candidatos del viewport.
    select coalesce(jsonb_agg(feature order by sort_key),'[]'::jsonb) into v_features
    from (
      select sort_key,feature from (
        select 'p:'||q.id::text sort_key,jsonb_build_object('type','Feature','id',q.id,'geometry',st_asgeojson(q.geom)::jsonb,'properties',coalesce(q.attributes,'{}'::jsonb)||jsonb_build_object('name',q.name,'lat',q.lat,'lon',q.lon)) feature
        from public.sigmun_geo_points q where q.layer_id=p_layer_id and q.geom && v_env
        union all
        select 'g:'||q.id::text,jsonb_build_object('type','Feature','id',q.id,'geometry',st_asgeojson(q.multipolygon)::jsonb,'properties',coalesce(q.attributes,'{}'::jsonb)||jsonb_build_object('name',q.name))
        from public.sigmun_geo_polygons q where q.layer_id=p_layer_id and q.multipolygon && v_env
        union all
        select 'l:'||q.id::text,jsonb_build_object('type','Feature','id',q.id,'geometry',st_asgeojson(q.multiline)::jsonb,'properties',coalesce(q.attributes,'{}'::jsonb)||jsonb_build_object('name',q.name))
        from public.sigmun_geo_lines q where q.layer_id=p_layer_id and q.multiline && v_env
      ) u order by sort_key limit v_limit offset v_offset
    ) s;
  end if;

  v_returned := jsonb_array_length(v_features);
  return jsonb_build_object(
    'type','FeatureCollection','features',v_features,
    'offset',v_offset,'limit',v_limit,'returned',v_returned,
    'has_more',(v_returned=v_limit),'engine','bbox_v2'
  );
end;
$$;

grant execute on function public.sigmun_geo_layer_geojson_bbox_page_v2(uuid,double precision,double precision,double precision,double precision,integer,integer) to anon, authenticated;

-- Marca automáticamente capas grandes existentes para carga por viewport en el frontend.
update public.sigmun_geo_layers
set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
  'render_strategy','viewport',
  'min_zoom', case when geometry_type='MultiPolygon' then 14 else 13 end
),
updated_at = now()
where geometry_type in ('MultiPolygon','MultiLineString','Point')
  and coalesce(metadata->>'feature_count','') ~ '^\d+$'
  and (metadata->>'feature_count')::integer >= 30000;
