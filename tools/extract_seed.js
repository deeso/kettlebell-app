// Pull EX + segs from the interval pages and convert to block workouts.
const fs=require('fs');
const out={exercises:{},workouts:[]};
function slug(s){return s.toLowerCase().replace(/[—–→]/g,' ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
const pages=[['core35.html','Kettlebell Core 35'],['strength35.html','Kettlebell Strength 35'],['onebell40.html','One-Bell Total Body 40'],['coreengine35.html','Core Engine 35']];
for(const [f,title] of pages){
  const s=fs.readFileSync(f,'utf8');
  const js=s.slice(s.indexOf('const EX'),s.indexOf('let t=0;'));
  const r=eval(js+';({EX,segs})');
  const blocks=[];
  for(const seg of r.segs){
    let b=blocks.find(x=>x.name===seg.block);
    if(!b){b={name:seg.block,_rounds:new Map()};blocks.push(b);}
    const key=seg.round||'R1';
    if(!b._rounds.has(key)) b._rounds.set(key,[]);
    b._rounds.get(key).push(seg);
  }
  const wb=blocks.map(b=>{
    const rounds=[...b._rounds.values()]; const first=rounds[0];
    const items=[]; let restAfter=0;
    first.forEach((seg,i)=>{
      if(seg.type==='work' || seg.block==='Cool-down'){
        const ex=r.EX[seg.name]||{};
        const id=slug(seg.name);
        if(!out.exercises[id]) out.exercises[id]={id,name:seg.name,cue:ex.cue||'',q:ex.q||seg.name,bell:ex.bell?String(ex.bell):''};
        items.push({kind:'move',exId:id,mode:'time',work:seg.sec,trans:0,bell:ex.bell?String(ex.bell):''});
      } else {
        const isLast=i===first.length-1;
        if(isLast && rounds.length>1) restAfter=seg.sec;
        else if(items.length) items[items.length-1].trans=seg.sec;
      }
    });
    return {name:b.name.replace(/^Block \d+ · /,'').replace('Warm-up','Warm-up'),rounds:rounds.length,restAfterRound:restAfter,items};
  });
  out.workouts.push({id:slug(title),name:title,type:'rounds',blocks:wb,countdown:10,cardio:{type:'mix',len:30}});
}
fs.writeFileSync('seed_intervals.json',JSON.stringify(out,null,1));
console.log(Object.keys(out.exercises).length, out.workouts.map(w=>w.name+':'+w.blocks.map(b=>b.name+'x'+b.rounds+'('+b.items.length+',r'+b.restAfterRound+')').join(' ')).join('\n'));
