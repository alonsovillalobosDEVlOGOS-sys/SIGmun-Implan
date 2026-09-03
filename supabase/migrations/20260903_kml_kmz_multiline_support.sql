-- SIGmun Delicias
-- Soporte completo para KML/KMZ con LineString/MultiLineString y carga masiva.
-- 2026-09-03

create table if not exists public.sigmun_geo_lines (
  id uuid primary key default gen_random_uuid(),
  layer_id uuid not null references public.sigmun_geo_layers(id) on delete cascade,
  multiline geometry(MultiLineString,4326) not null,
  name text,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sigmun_geo_lines_layer_idx on public.sigmun_geo_lines(layer_id);
create index if not exists sigmun_geo_lines_geom_gix on public.sigmun_geo_lines using gist(multiline);

alter table public.sigmun_geo_lines enable row level security;

drop policy if exists public_read_geo_lines on public.sigmun_geo_lines;
create policy public_read_geo_lines
on public.sigmun_geo_lines
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.sigmun_geo_layers l
    where l.id = sigmun_geo_lines.layer_id
      and l.is_public = true
  )
);

drop policy if exists sigmun_editors_manage_geo_lines on public.sigmun_geo_lines;
create policy sigmun_editors_manage_geo_lines
on public.sigmun_geo_lines
for all
to authenticated
using (
  exists (
    select 1 from public.sigmun_user_profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('admin','editor')
  )
)
with check (
  exists (
    select 1 from public.sigmun_user_profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('admin','editor')
  )
);

grant select on public.sigmun_geo_lines to anon, authenticated;
grant insert, update, delete on public.sigmun_geo_lines to authenticated;

alter table public.sigmun_geo_layers
  drop constraint if exists sigmun_geo_layers_geometry_type_check;

alter table public.sigmun_geo_layers
  add constraint sigmun_geo_layers_geometry_type_check
  check (geometry_type in ('Point','MultiPolygon','MultiLineString','Mixed'));

create or replace function public.sigmun_insert_geo_line(
  p_layer_id uuid,
  p_geometry jsonb,
  p_name text default null,
  p_attributes jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_geom geometry;
  v_id uuid;
begin
  v_geom := st_setsrid(st_geomfromgeojson(p_geometry::text),4326);

  if geometrytype(v_geom) = 'LINESTRING' then
    v_geom := st_multi(v_geom);
  end if;

  if geometrytype(v_geom) <> 'MULTILINESTRING' then
    raise exception 'La geometría debe ser LineString o MultiLineString';
  end if;

  insert into public.sigmun_geo_lines(layer_id,multiline,name,attributes)
  values(
    p_layer_id,
    v_geom,
    p_name,
    coalesce(p_attributes,'{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.sigmun_insert_geo_line(uuid,jsonb,text,jsonb)
to authenticated;

create or replace function public.sigmun_insert_geo_batch(
  p_layer_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  item jsonb;
  kind text;
  geom geometry;
  c_points integer := 0;
  c_polygons integer := 0;
  c_lines integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items debe ser un arreglo JSON';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    kind := coalesce(item->>'kind','');

    if kind = 'Point' then
      insert into public.sigmun_geo_points(layer_id,lat,lon,name,attributes)
      values(
        p_layer_id,
        (item->>'lat')::double precision,
        (item->>'lon')::double precision,
        nullif(item->>'name',''),
        coalesce(item->'attributes','{}'::jsonb)
      );
      c_points := c_points + 1;

    elsif kind = 'MultiPolygon' then
      geom := st_setsrid(st_geomfromgeojson((item->'geometry')::text),4326);
      if geometrytype(geom) = 'POLYGON' then geom := st_multi(geom); end if;
      if geometrytype(geom) <> 'MULTIPOLYGON' then
        raise exception 'Geometría de polígono inválida';
      end if;
      insert into public.sigmun_geo_polygons(layer_id,multipolygon,name,attributes)
      values(
        p_layer_id,
        geom,
        nullif(item->>'name',''),
        coalesce(item->'attributes','{}'::jsonb)
      );
      c_polygons := c_polygons + 1;

    elsif kind = 'MultiLineString' then
      geom := st_setsrid(st_geomfromgeojson((item->'geometry')::text),4326);
      if geometrytype(geom) = 'LINESTRING' then geom := st_multi(geom); end if;
      if geometrytype(geom) <> 'MULTILINESTRING' then
        raise exception 'Geometría lineal inválida';
      end if;
      insert into public.sigmun_geo_lines(layer_id,multiline,name,attributes)
      values(
        p_layer_id,
        geom,
        nullif(item->>'name',''),
        coalesce(item->'attributes','{}'::jsonb)
      );
      c_lines := c_lines + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'points', c_points,
    'polygons', c_polygons,
    'lines', c_lines,
    'total', c_points + c_polygons + c_lines
  );
end;
$$;

grant execute on function public.sigmun_insert_geo_batch(uuid,jsonb)
to authenticated;

create or replace function public.sigmun_geo_layer_geojson(p_layer_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'type','FeatureCollection',
    'features',coalesce(jsonb_agg(feature),'[]'::jsonb)
  )
  from (
    select jsonb_build_object(
      'type','Feature',
      'id',p.id,
      'geometry',st_asgeojson(p.geom)::jsonb,
      'properties',coalesce(p.attributes,'{}'::jsonb)
        || jsonb_build_object('name',p.name,'lat',p.lat,'lon',p.lon)
    ) feature
    from public.sigmun_geo_points p
    where p.layer_id = p_layer_id

    union all

    select jsonb_build_object(
      'type','Feature',
      'id',g.id,
      'geometry',st_asgeojson(g.multipolygon)::jsonb,
      'properties',coalesce(g.attributes,'{}'::jsonb)
        || jsonb_build_object('name',g.name)
    ) feature
    from public.sigmun_geo_polygons g
    where g.layer_id = p_layer_id

    union all

    select jsonb_build_object(
      'type','Feature',
      'id',l.id,
      'geometry',st_asgeojson(l.multiline)::jsonb,
      'properties',coalesce(l.attributes,'{}'::jsonb)
        || jsonb_build_object('name',l.name)
    ) feature
    from public.sigmun_geo_lines l
    where l.layer_id = p_layer_id
  ) s;
$$;

grant execute on function public.sigmun_geo_layer_geojson(uuid)
to anon, authenticated;
