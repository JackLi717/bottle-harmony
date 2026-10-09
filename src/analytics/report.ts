import type { ReadDatabase } from '../storage/sql.ts';
import { PRODUCT_METRICS_VERSION } from '../storage/metricsSchema.ts';
/** A single-installation report. Missing/unmatured observations are never treated as failures. */
export function localAnalyticsReport(db: ReadDatabase, asOf = Date.now(), windowMs = 7 * 86400000) {
  if (!Number.isFinite(asOf) || !Number.isFinite(windowMs) || windowMs <= 0) throw new Error('Invalid observation window');
  const firsts = db.getAllSync<{ mode:string;level_id:string;rules:string;catalog:string;entered_at:number;completed_at:number|null;observed_first:number;summary:string|null }>('SELECT * FROM metric_firsts ORDER BY mode,entered_at');
  const modes = [...new Set(firsts.map(x=>x.mode))];
  const completion = modes.map(mode=>{
    const rows=firsts.filter(x=>x.mode===mode && x.observed_first && x.entered_at<=asOf);
    const mature=rows.filter(x=>x.entered_at<=asOf-windowMs);
    const eligible=mature.filter(x=>!x.summary || !JSON.parse(x.summary).partial);
    const complete=eligible.filter(x=>x.completed_at!==null && x.completed_at<=asOf && x.completed_at<=x.entered_at+windowMs && x.summary && !JSON.parse(x.summary).partial);
    const partial=mature.filter(x=>x.summary && JSON.parse(x.summary).partial);
    return {mode,entered:rows.length,mature:mature.length,withinWindow:complete.length,partial:partial.length,eligible:eligible.length,unmatured:rows.length-mature.length,rate:eligible.length ? complete.length/eligible.length:null};
  });
  const retention = db.getAllSync<{key:string;value:string}>("SELECT * FROM metadata WHERE key LIKE 'metrics-activation:%'").flatMap(row=>{
    const first=JSON.parse(row.value) as {day:string;offset:number};
    const mode=row.key.slice('metrics-activation:'.length);
    return [1,7,30].map(target=>{
      const day=new Date(Date.parse(first.day)+target*86400000).toISOString().slice(0,10);
      const mature=asOf>=Date.parse(day)+86400000-first.offset*60000;
      const returned=!!db.getFirstSync("SELECT 1 FROM metric_days WHERE day=? AND offset=? AND mode=? AND metric='cohort-active'",day,first.offset,mode);
      return {mode,target,cohortDay:first.day,offset:first.offset,mature,returned,rate:mature?Number(returned):null};
    });
  });
  const summaries=db.getAllSync<{mode:string;level_id:string;catalog:string;rules:string;version:string;quality:string;assistance:string;metric:string;bucket:string;value:number}>('SELECT * FROM metric_summary ORDER BY mode,level_id,metric,bucket');
  const distributions=new Map<string,{mode:string;metric:string;quality:string;assistance:string;catalog:string;rules:string;version:string;count:number;buckets:Record<string,number>}>();
  for(const row of summaries.filter(x=>x.metric.endsWith('_distribution'))) {
    const key=JSON.stringify([row.mode,row.metric,row.quality,row.assistance,row.catalog,row.rules,row.version]);
    const group=distributions.get(key)??{mode:row.mode,metric:row.metric,quality:row.quality,assistance:row.assistance,catalog:row.catalog,rules:row.rules,version:row.version,count:0,buckets:{}};
    group.count+=row.value;group.buckets[row.bucket]=(group.buckets[row.bucket]??0)+row.value;distributions.set(key,group);
  }
  function percentile(group:{count:number;buckets:Record<string,number>}, fraction:number) {
    if(!group.count)return null;
    let n=0,lower=0;
    for(const [edge,count] of Object.entries(group.buckets).sort(([a],[b])=>(a==='overflow'?Infinity:Number(a))-(b==='overflow'?Infinity:Number(b)))) {
      n+=count;if(n>=Math.ceil(group.count*fraction))return {lowerExclusive:edge==='0'?null:lower,upperInclusive:edge==='overflow'?null:Number(edge)};
      lower=Number(edge);
    }
    return null;
  }
  return {
    version:PRODUCT_METRICS_VERSION,asOf,windowMs,unit:'one installation; no population retention estimate',
    coverage:db.getAllSync<{key:string;value:string}>("SELECT * FROM metadata WHERE key LIKE 'product-metrics-%' OR key LIKE 'metrics-activation:%' OR key LIKE 'analytics-%' OR key='metrics-last-prune'"),
    completion,
    retention,
    firstExperiences:firsts.map(row=>({...row,summary:row.summary?JSON.parse(row.summary):null})),
    distributions:[...distributions.values()].map(group=>({...group,p50:percentile(group,.5),p90:percentile(group,.9)})),
    summaries,
    dailyActivity:db.getAllSync('SELECT * FROM metric_days ORDER BY day,mode,metric'),
    openChallenges:db.getAllSync("SELECT mode,level_id,catalog,rules,started_at,last_at,partial,totals,flags FROM metric_runs WHERE result='playing'"),
    delivery:{pending:db.getFirstSync<{n:number}>('SELECT COUNT(*) n FROM metric_outbox')!.n,acknowledgement:'native SDK acceptance, not confirmed cloud receipt; crash retries may duplicate events'},
  };
}
