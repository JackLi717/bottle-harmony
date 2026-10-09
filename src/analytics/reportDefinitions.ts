/** Saved GA4 explorations use these event filters. Sums on different lifecycle events must never be combined. */
export const REPORT_SECTIONS = [
  {name:'01 Activity',events:['bh_app_ready','bh_app_foreground','bh_active_day','bh_milestone','bh_first_action'],rows:['Event name','BH Mode'],metrics:['Event count','Total users','BH First action ms']},
  {name:'02 Progression',events:['bh_puzzle_start','bh_puzzle_complete','bh_attempt_end'],rows:['Event name','BH Mode','BH Level','BH Result','BH First clear'],metrics:['Event count','Total users']},
  {name:'03 Time',events:['bh_puzzle_timing'],rows:['BH Mode','BH Integrity','BH Tier'],metrics:['Event count','BH Foreground ms','BH Blocked ms','BH Available ms','BH Observation ms','BH Peek ms','BH Hidden ms','BH Cleanup ms']},
  {name:'04 Operations',events:['bh_puzzle_operations'],rows:['BH Mode','BH Assistance'],metrics:['Event count','BH Pours','BH Hint pours','BH Undos','BH Resets','BH Peeks','BH Melts','BH Reserves']},
  {name:'05 Assistance',events:['bh_hint_request','bh_hint_result','bh_hint_execute','bh_stalled','bh_stalled_recovery','bh_stalled_notice'],rows:['Event name','BH Mode','BH Result','BH Resource'],metrics:['Event count','BH Search ms']},
  {name:'06 Memory',events:['bh_memory_answer','bh_memory_check'],rows:['Event name','BH Answer','BH Unassisted','BH First exposure'],metrics:['Event count','Total users']},
  {name:'07 Preferences',events:['bh_preference','bh_tutorial'],rows:['Event name','BH Preference','BH Value'],metrics:['Event count','Total users']},
  {name:'08 Quality',events:['bh_quality'],rows:['BH Operation','BH Result'],metrics:['Event count','BH Quality count']},
  {name:'09 Credits',events:['bh_credit_change','bh_credit_spend'],rows:['Event name','BH Mode'],metrics:['Event count','BH Credits expected','BH Credits awarded','BH Credits capped','BH Credits spent']},
  {name:'10 Return',events:['bh_active_day'],rows:['BH Mode','BH Cohort day','BH Since activation'],metrics:['Event count','Total users']},
  {name:'11 Visits',events:['bh_puzzle_visit','bh_puzzle_leave'],rows:['Event name','BH Mode','BH Reason'],metrics:['Event count','Total users','BH Foreground ms','BH Blocked ms','BH Available ms','BH Observation ms','BH Peek ms','BH Hidden ms','BH Cleanup ms']},
  {name:'12 Actions',events:['bh_puzzle_action'],rows:['BH Mode','BH Level','BH Action'],metrics:['Event count','Total users']},
  {name:'13 Lifecycle',events:['bh_app_ready','bh_app_foreground','bh_app_background'],rows:['Event name','BH Environment'],metrics:['Event count','Total users']},
] as const;
export const GOOGLE_PROJECTS = {
 production:{projectId:'bottle-harmony-production',projectNumber:'947509375072',propertyId:'558297244',accountId:'411231811',coreReport:'pitCQRdjTK6S83KRVjtoMw',detailReport:'bDF4P950RDmkvfJt5OEHng'},
 test:{projectId:'bottle-harmony-test',projectNumber:'416852076322',propertyId:'558291890',accountId:'411231811',coreReport:'2JjRMjb7RLyyTdhyg5IdSQ',detailReport:'kZLRNv_9TFmj1DifD6BfYA'},
} as const;
