create or replace function public.sigmun_geo_layer_geojson_page(
  p_layer_id uuid,
  p_limit integer default 800,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with params as (
  select greatest(1, least(coalesce(p_limit,800), 1500))::integer as lim,
         greatest(0, coalesce(p_offset,0))::integer as off
), all_features as (
  select ('p:'||p.id::text) as sort_key,
         jsonb_build_object('type','Feature','id',p.id,'geometry',st_asgeojson(p.geom)::jsonb,
           'properties',coalesce(p.attributes,'{}'::jsonb)||jsonb_build_object('name',p.name,'lat',p.lat,'lon',p.lon)) feature
  from public.sigmun_geo_points p where p.layer_id=p_layer_id
  union all
  select ('g:'||g.id::text),jsonb_build_object('type','Feature','id',g.id,'geometry',st_asgeojson(g.multipolygon)::jsonb,
           'properties',coalesce(g.attributes,'{}'::jsonb)||jsonb_build_object('name',g.name))
  from public.sigmun_geo_polygons g where g.layer_id=p_layer_id
  union all
  select ('l:'||l.id::text),jsonb_build_object('type','Feature','id',l.id,'geometry',st_asgeojson(l.multiline)::jsonb,
           'properties',coalesce(l.attributes,'{}'::jsonb)||jsonb_build_object('name',l.name))
  from public.sigmun_geo_lines l where l.layer_id=p_layer_id
), totals as (select count(*)::integer total from all_features),
paged as (select feature from all_features,params order by sort_key limit (select lim from params) offset (select off from params)),
payload as (select coalesce(jsonb_agg(feature),'[]'::jsonb) features from paged)
select jsonb_build_object('type','FeatureCollection','features',payload.features,'total',totals.total,'offset',params.off,'limit',params.lim,
  'returned',jsonb_array_length(payload.features),'has_more',(params.off+jsonb_array_length(payload.features))<totals.total)
from payload,totals,params;
$$;

grant execute on function public.sigmun_geo_layer_geojson_page(uuid,integer,integer) to anon, authenticated;
