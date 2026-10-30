/* Where each puzzle sits: the product pipeline (continuous design, application development, continuous delivery,
   hypothesis testing), with the four steps running inside Development.
   One source of truth. A puzzle page shows its own strip with  <div data-pipeline></div><script src="pipeline.js"></script>
   The index shows the whole map with  <div data-pipeline-map></div>  in the same way.
   To move a puzzle, change its line in PUZZLES. */
(function(){
  const STAGES=[["design","Design"],["development","Development"],["delivery","Delivery"],["testing","Hypothesis testing"]];
  const STEPS=[["intent","Intent"],["plan","Plan"],["alternatives","Alternatives"],["debug","Test & debug"]];
  const PUZZLES={
    "s1-warmup":           {title:"Punch card: predict, then run", s:1, stages:["design","development"], steps:["intent","debug"]},
    "s1-predict-then-run": {title:"Predict, then run",             s:1, stages:["design","development"], steps:["intent","debug"]},
    "s2-read-the-plan":    {title:"Read the plan before the code", s:2, stages:["development"], steps:["plan"]},
    "s2-pick-help":        {title:"Pick a way to get help",        s:2, stages:["development"], steps:["alternatives"]},
    "s2-github-setup":     {title:"Set up for Class 3",            s:2, stages:["delivery"],    steps:[]},
    "s3-whose-rule":       {title:"Whose rule is it?",             s:3, stages:["development"], steps:["debug"], handoff:true},
    "s3-phone":            {title:"Breaks at the phone",           s:3, stages:["development"], steps:["debug"], handoff:true},
    "s4-checkbox":         {title:"The checkbox that does nothing",s:4, stages:["development"], steps:["debug"], handoff:true},
    "s4-interface":        {title:"Where the fix goes",            s:4, stages:["development"], steps:["alternatives"]},
    "s4-price":            {title:"Under a hundred dollars",       s:4, stages:["development"], steps:["debug"], handoff:true},
    "s5-price":            {title:"The price that wouldn't update",s:5, stages:["design"],      steps:["debug"]},
    "s5-map":              {title:"Map it from the story",         s:5, stages:["design"],      steps:["intent","plan"]},
    "s5-cost":             {title:"Who can see the cost?",         s:5, stages:["design","delivery"], steps:["alternatives"]},
    "s5-context":          {title:"What does the AI get to see?",  s:5, stages:["design"],      steps:["intent"]},
  };

  const css=`
  .pl{--pl-head:var(--head,#002D45);--pl-muted:var(--muted,#808285);--pl-line:var(--line-soft,#D1D3D4);--pl-on:var(--second,#63ADB1);--pl-bg:var(--panel,#fff);
      font-family:var(--sans,"Abel",system-ui,sans-serif);font-size:13px;letter-spacing:.04em;margin:10px 0 14px;max-width:680px}
  .pl-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
  .pl-stage,.pl-step{border:1px solid var(--pl-line);border-radius:3px;padding:3px 8px;color:var(--pl-muted);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pl-stage.on{border-color:var(--pl-on);background:var(--pl-on);color:#fff}
  .pl-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin-top:6px;padding-top:6px;position:relative}
  .pl-steps::before{content:"";position:absolute;top:0;left:calc(37.5% - 1px);width:2px;height:6px;background:var(--pl-line)}
  .pl-step{font-size:12px;padding:2px 4px}
  .pl-step.on{border-color:var(--pl-on);color:var(--pl-head);box-shadow:inset 0 -3px 0 var(--pl-on)}
  .pl-note{color:var(--pl-muted);font-size:12.5px;margin-top:6px;letter-spacing:.02em}
  .pl-tag{display:inline-block;font-family:var(--sans,"Abel",system-ui,sans-serif);font-size:11px;letter-spacing:.08em;text-transform:uppercase;
          color:#fff;background:var(--second,#63ADB1);border-radius:3px;padding:1px 6px;margin-left:8px;vertical-align:2px}
  .plmap{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:8px 0 24px}
  .plmap h3{font-family:var(--serif,"Bree Serif",Georgia,serif);font-weight:400;color:var(--pl-head,#002D45);font-size:17px;margin:0 0 6px}
  .plmap .col{border-top:3px solid var(--second,#63ADB1);padding-top:6px}
  .plmap .grp{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#808285);margin:8px 0 2px}
  .plmap a{display:block;margin:2px 0;font-size:14px}
  .plmap .ses{color:var(--muted,#808285);font-size:12px}
  @media (max-width:560px){.plmap{grid-template-columns:1fr 1fr}.pl-step,.pl-stage{font-size:11px;padding:2px 3px;white-space:normal;line-height:1.25;display:flex;align-items:center;justify-content:center}}`;
  const st=document.createElement("style"); st.textContent=css; document.head.append(st);

  function strip(p){
    const el=document.createElement("div"); el.className="pl"; el.setAttribute("aria-label","Where this puzzle sits in the product pipeline");
    const row=document.createElement("div"); row.className="pl-row";
    STAGES.forEach(([k,n])=>{ const d=document.createElement("div"); d.className="pl-stage"+(p.stages.includes(k)?" on":""); d.textContent=n; row.append(d); });
    const steps=document.createElement("div"); steps.className="pl-steps";
    STEPS.forEach(([k,n])=>{ const d=document.createElement("div"); d.className="pl-step"+(p.steps.includes(k)?" on":""); d.textContent=n; steps.append(d); });
    el.append(row,steps);
    if(p.handoff){ const n=document.createElement("div"); n.className="pl-note"; n.textContent="The commit question is where your change leaves Development and goes to Delivery."; el.append(n); }
    return el;
  }
  function map(){
    const host=document.createElement("div"); host.className="plmap";
    STAGES.forEach(([k,n])=>{
      const col=document.createElement("div"); col.className="col"; const h=document.createElement("h3"); h.textContent=n; col.append(h);
      const here=Object.entries(PUZZLES).filter(([,p])=>p.stages.includes(k));
      const groups = k==="development" ? STEPS.map(([sk,sn])=>[sn, here.filter(([,p])=>p.steps.includes(sk))]) : [["",here]];
      groups.forEach(([g,list])=>{
        if(g){ const d=document.createElement("div"); d.className="grp"; d.textContent=g+(list.length?"":" · none yet"); col.append(d); }
        if(!g && !list.length){ const d=document.createElement("div"); d.className="ses"; d.textContent="none yet"; col.append(d); }
        list.forEach(([id,p])=>{ const a=document.createElement("a"); a.href=id+".html"; a.textContent=p.title+" ";
          const s=document.createElement("span"); s.className="ses"; s.textContent="S"+p.s; a.append(s); col.append(a); });
      });
      host.append(col);
    });
    return host;
  }
  const id=(location.pathname.split("/").pop()||"").replace(/\.html$/,"");
  document.querySelectorAll("[data-pipeline]").forEach(h=>{ const p=PUZZLES[h.dataset.pipeline||id]; if(p) h.replaceWith(strip(p)); else h.remove(); });
  document.querySelectorAll("[data-pipeline-map]").forEach(h=>h.replaceWith(map()));
})();
