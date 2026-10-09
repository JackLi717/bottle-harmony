import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { localAnalyticsReport } from '../src/analytics/report.ts';
import type { ReadDatabase, SqlValue } from '../src/storage/sql.ts';
const input=process.argv[2];
if(!input)throw new Error('Usage: npm run analytics:report -- /path/to/player.sqlite [asOf ISO date] [window days]');
const native=new DatabaseSync(resolve(input),{readOnly:true});
const db:ReadDatabase={getAllSync:<T>(sql:string,...params:SqlValue[])=>native.prepare(sql).all(...params) as T[],getFirstSync:<T>(sql:string,...params:SqlValue[])=>native.prepare(sql).get(...params) as T??null};
const report=localAnalyticsReport(db,process.argv[3]?Date.parse(process.argv[3]):Date.now(),Number(process.argv[4]??7)*86400000);
mkdirSync('builds/analytics',{recursive:true});
writeFileSync('builds/analytics/local-report.json',JSON.stringify(report,null,2));
const escape=(value:unknown)=>String(value??'unknown').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function table(rows:object[]){if(!rows.length)return '<p>No observations</p>';const keys=Object.keys(rows[0]);return '<div class="table"><table><thead><tr>'+keys.map(k=>'<th>'+escape(k)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+Object.values(row).map(v=>'<td>'+escape(typeof v==='object'?JSON.stringify(v):v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
const groups=[['Coverage and delivery',[...report.coverage,{key:'pending',value:String(report.delivery.pending)}]],['First-experience completion',report.completion],['One-installation D1/D7/D30 return',report.retention],['Puzzle first completion',report.firstExperiences],['Time and operation distributions',report.distributions],['Memory accuracy, attempts and assistance',report.summaries.filter(x=>/answer|unassisted|attempt/.test(x.metric))],['Durable level summaries',report.summaries],['Daily activity',report.dailyActivity],['Unfinished challenges',report.openChallenges]] as const;
writeFileSync('builds/analytics/local-report.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Bottle Harmony local analytics</title><style>body{font:14px system-ui;margin:32px;color:#172c38;background:#f5faf8}h1{font-size:28px}h2{margin-top:36px}p{max-width:900px;line-height:1.6}.table{overflow:auto}table{border-collapse:collapse;background:white}td,th{padding:9px;border:1px solid #cbd8d3;max-width:500px;overflow-wrap:anywhere;text-align:left}th{background:#e5f0e9}td{vertical-align:top}</style><h1>Bottle Harmony · local analytics</h1><p>One installation. Report cutoff '+escape(new Date(report.asOf).toISOString())+'. Window '+report.windowMs/86400000+' days. Zero denominators are unknown. Percentiles are bucket intervals. Unfinished and partial observations are shown separately. No data is uploaded by this command.</p>'+groups.map(([title,rows])=>'<h2>'+title+'</h2>'+table(rows as object[])).join('')+'</html>');
native.close();console.log(resolve('builds/analytics/local-report.html'));
