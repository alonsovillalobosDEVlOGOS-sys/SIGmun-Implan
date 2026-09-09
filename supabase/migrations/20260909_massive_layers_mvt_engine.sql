-- SIGmun Delicias · Massive Layers Engine
-- MVT dinámico desde PostGIS para capas extensas.
-- Mantiene GeoJSON/viewport existentes como fallback.

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
  v_min_zoom integer := 0;
  v_limit integer := greatest(500, least(coalesce(p_feature_limit, 8000), 12000));
  v_mvt bytea := ''::bytea;
begin
  if p_z is null or p_x is null or p_y is null or p_z < 0 or p_z > 22 then
    return '';
  end if;

  select geometry_type,
         greatest(0, least(22, coalesce(nullif(metadata->>'min_zoom','')::integer, 0)))
    into v_type, v_min_zoom
  from public.sigmun_geo_layers
  where id = p_layer_id;

  if not found or p_z < v_min_zoom then
    return '';
  end if;

  if v_type = 'MultiPolygon' then
    with b as (
      select st_tileenvelope(p_z,p_x,p_y) as env3857
    ), bounds as (
      select env3857, st_transform(env3857,4326) as env4326 from b
    ), rows as (
      select
        q.id::text as feature_id,
        coalesce(q.attributes,'{}'::jsonb)
          || jsonb_build_object(
               '_sigmun_id',q.id::text,
               '_sigmun_layer_id',p_layer_id::text,
               'name',q.name
             ) as props,
        st_asmvtgeom(
          st_transform(q.multipolygon,3857),
          bounds.env3857,
          4096,
          64,
          true
        ) as geom
      from public.sigmun_geo_polygons q
      cross join bounds
      where q.layer_id = p_layer_id
        and q.multipolygon && bounds.env4326
      order by q.id
      limit v_limit
    )
    select coalesce(st_asmvt(rows,'sigmun',4096,'geom'),'') into v_mvt
    from rows
    where geom is not null;

  elsif v_type = 'MultiLineString' then
    with b as (
      select st_tileenvelope(p_z,p_x,p_y) as env3857
    ), bounds as (
      select env3857, st_transform(env3857,4326) as env4326 from b
    ), rows as (
      select
        q.id::text as feature_id,
        coalesce(q.attributes,'{}'::jsonb)
          || jsonb_build_object(
               '_sigmun_id',q.id::text,
               '_sigmun_layer_id',p_layer_id::text,
               'name',q.name
             ) as props,
        st_asmvtgeom(
          st_transform(q.multiline,3857),
          bounds.env3857,
          4096,
          64,
          true
        ) as geom
      from public.sigmun_geo_lines q
      cross join bounds
      where q.layer_id = p_layer_id
        and q.multiline && bounds.env4326
      order by q.id
      limit v_limit
    )
    select coalesce(st_asmvt(rows,'sigmun',4096,'geom'),'') into v_mvt
    from rows
    where geom is not null;

  elsif v_type = 'Point' then
    with b as (
      select st_tileenvelope(p_z,p_x,p_y) as env3857
    ), bounds as (
      select env3857, st_transform(env3857,4326) as env4326 from b
    ), rows as (
      select
        q.id::text as feature_id,
        coalesce(q.attributes,'{}'::jsonb)
          || jsonb_build_object(
               '_sigmun_id',q.id::text,
               '_sigmun_layer_id',p_layer_id::text,
               'name',q.name,
               'lat',q.lat,
               'lon',q.lon
             ) as props,
        st_asmvtgeom(
          st_transform(q.geom,3857),
          bounds.env3857,
          4096,
          64,
          true
        ) as geom
      from public.sigmun_geo_points q
      cross join bounds
      where q.layer_id = p_layer_id
        and q.geom && bounds.env4326
      order by q.id
      limit v_limit
    )
    select coalesce(st_asmvt(rows,'sigmun',4096,'geom'),'') into v_mvt
    from rows
    where geom is not null;

  else
    -- Mixed: se mantiene por GeoJSON/viewport. Evita mezclar tipos dentro de un tile genérico.
    return '';
  end if;

  return encode(coalesce(v_mvt,''::bytea),'base64');
end;
$function$;

comment on function public.sigmun_geo_layer_mvt_v1(uuid,integer,integer,integer,integer)
is 'Entrega una tesela vectorial MVT en base64 para una capa SIGmun. Optimizada para MapLibre mediante protocolo sigmvt://.';

revoke execute on function public.sigmun_geo_layer_mvt_v1(uuid,integer,integer,integer,integer) from public;
grant execute on function public.sigmun_geo_layer_mvt_v1(uuid,integer,integer,integer,integer) to anon, authenticated;

-- Propiedades completas bajo demanda para identificar una entidad renderizada como MVT.
create or replace function public.sigmun_geo_feature_properties_v1(
  p_layer_id uuid,
  p_feature_id text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $function$
declare
  v_type text;
  v_id uuid;
  v_result jsonb;
begin
  begin
    v_id := p_feature_id::uuid;
  exception when others then
    return null;
  end;

  select geometry_type into v_type
  from public.sigmun_geo_layers
  where id = p_layer_id;
  if not found then return null; end if;

  if v_type='MultiPolygon' then
    select coalesce(attributes,'{}'::jsonb)||jsonb_build_object('name',name,'_sigmun_id',id::text,'_sigmun_layer_id',layer_id::text)
      into v_result from public.sigmun_geo_polygons where layer_id=p_layer_id and id=v_id;
  elsif v_type='MultiLineString' then
    select coalesce(attributes,'{}'::jsonb)||jsonb_build_object('name',name,'_sigmun_id',id::text,'_sigmun_layer_id',layer_id::text)
      into v_result from public.sigmun_geo_lines where layer_id=p_layer_id and id=v_id;
  elsif v_type='Point' then
    select coalesce(attributes,'{}'::jsonb)||jsonb_build_object('name',name,'lat',lat,'lon',lon,'_sigmun_id',id::text,'_sigmun_layer_id',layer_id::text)
      into v_result from public.sigmun_geo_points where layer_id=p_layer_id and id=v_id;
  end if;

  return v_result;
end;
$function$;

comment on function public.sigmun_geo_feature_properties_v1(uuid,text)
is 'Devuelve atributos completos de una entidad MVT bajo demanda, respetando RLS.';

revoke execute on function public.sigmun_geo_feature_properties_v1(uuid,text) from public;
grant execute on function public.sigmun_geo_feature_properties_v1(uuid,text) to anon, authenticated;
