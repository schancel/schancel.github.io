// Presentation and input arithmetic only. All market/protocol results come from C++.
export const number = n => Number(n || 0).toLocaleString(undefined, {maximumFractionDigits: 6});
export const money = n => n == null ? '—' : `${number(n / 1e6)} XPI (${number(n)} atoms)`;
const $ = id => document.getElementById(id);
export const say = (id, text) => { if ($(id)) $(id).textContent = text; };
const names = ['human', 'background', 'spam'];
const colors = ['#398468', '#b98432', '#628ba0', '#ad5960'];
export function workload(c) {
  const overlap = Math.max(0, Math.min(c.duration_s, c.burst_end_s) - Math.min(c.duration_s, c.burst_start_s));
  const weightedSeconds = c.duration_s + overlap * (c.burst_multiplier - 1);
  const counts = names.map(n => (c[n + '_rate'] || 0) * weightedSeconds);
  const service = Math.floor((c.block_bytes ?? 30000) / 250) / (c.block_interval_s ?? 10);
  return {overlap, counts, total: counts.reduce((a,b)=>a+b,0), service};
}
export function validate(c, bounds, labels) {
  for (const [key, value] of Object.entries(c)) {
    if (!Number.isSafeInteger(value)) throw Error(`${labels[key] || key.replaceAll('_',' ')} must be a whole number.`);
    if (bounds[key] && (value < bounds[key][0] || value > bounds[key][1])) throw Error(`${labels[key] || key.replaceAll('_',' ')} must be between ${bounds[key][0]} and ${bounds[key][1]}.`);
  }
  if (c.min_recipient_atoms > c.gross_payment_atoms) throw Error('Minimum recipient net cannot exceed the gross payment.');
  if (c.burst_end_s < c.burst_start_s) throw Error('Burst end must be at or after burst start.');
  if (workload(c).total > 30000) throw Error('Planned arrivals exceed the 30,000-payment browser limit. Reduce rates, offer duration, or burst size; no payments will be silently dropped.');
  return c;
}
export function describeWorkload(c) {
  const w = workload(c), offered = w.total / c.duration_s;
  const minExtra = Math.max(0, Math.ceil(w.total / w.service) - c.duration_s);
  return `${number(w.counts[0])} human + ${number(w.counts[1])} background + ${number(w.counts[2])} spam = ${number(w.total)} planned payments. ${c.duration_s}s offer window; ${w.overlap}s of burst overlap (clipped to that window); up to ${c.drain_s}s drain with no new arrivals. Average offered ${number(Math.round(offered*100)/100)} /s versus nominal mining ${number(Math.round(w.service*100)/100)} /s. ${offered > w.service ? `Overload is a valid experiment; even ideal service needs at least ${minExtra}s extra, before fee or delivery limits.` : 'Nominal average capacity is sufficient; bursts, fees and delivery can still create a backlog.'}`;
}
export function setupPreview(read, bounds, labels) {
  const update = () => { try {const c = validate(read(), bounds, labels); const w=workload(c),target=$('workload-preview');target.replaceChildren();const lead=document.createElement('p');lead.textContent=`${number(w.counts[0])} human + ${number(w.counts[1])} background + ${number(w.counts[2])} spam = ${number(w.total)} planned payments.`;const timing=document.createElement('p');timing.textContent=`Offer: ${c.duration_s}s · drain: up to ${c.drain_s}s`;const more=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Traffic versus capacity';const explanation=document.createElement('p');explanation.textContent=describeWorkload(c);more.append(summary,explanation);target.append(lead,timing,more);say('config-error','');return true;} catch(e){say('config-error',e.message);say('workload-preview','Correct the configuration to calculate planned arrivals.');return false;} };
  $('controls').addEventListener('input',update);update();return update;
}
export function fields(defaults, bounds, labels, selects = {}, proposal = false) {
  const common = {duration_s:'Offer window (seconds; new arrivals only)',human_rate:'Ordinary payments / second (whole number)',background_rate:'Background payments / second (whole number)',spam_rate:'Spam payments / second (whole number)',burst_multiplier:'Arrival multiplier during burst',burst_start_s:'Burst starts (seconds into offer window)',burst_end_s:'Burst ends (seconds; clipped to offer window)',human_budget:'Ordinary payment fee cap (atoms / payment)',background_budget:'Background fee cap (atoms / payment)',spam_budget:'Spam fee cap (atoms / payment)',gross_payment_atoms:'Gross payment (atoms, fee included)',min_recipient_atoms:'Minimum recipient net (atoms)',human_bid_rate:'Ordinary baseline bid (atoms / 1,000 bytes)',background_bid_rate:'Background baseline bid (atoms / 1,000 bytes)',spam_bid_rate:'Spam baseline bid (atoms / 1,000 bytes)',bid_jitter_bps:'Baseline bid variation (basis points)',seed:'Reproducible random seed',min_rate:'Minimum proposal rate (atoms / 1,000 bytes)',max_rate:'Maximum proposal rate (atoms / 1,000 bytes)'};
  Object.assign(labels, common);
  const groups = new Map();
  const group = key => /rate$/.test(key) && names.some(n=>key===n+'_rate') || /^(duration_s|drain_s|burst_|seed)/.test(key) ? 'Traffic & observation window' : /^(human_|background_|spam_|gross_|min_recipient|wallet_|bid_|fixed_|retry_|lifetime_|quote_|dispatch_)/.test(key) ? 'Wallet payments & fee limits' : /^(cpu_|write_|growth_|retained_|archive|hardware_|target_util|ewma_|desired_interval|deadband_|kp_|ki_|kd_|integral_|rise_|fall_|warmup_|resource_)/.test(key) ? 'Resource budgets & feedback' : proposal && /^(desired_seed|confirmed_seed|min_rate|max_rate|epoch_|activation_|proposal_|aggregation|bad_|partition_|voter_)/.test(key) ? 'Proposals, voting & adversaries' : 'Admission, mining & delivery';
  for (const [key,value] of Object.entries(defaults)) {
    const title=group(key);if(!groups.has(title)){const d=document.createElement('details');d.className='control-group';const s=document.createElement('summary');s.textContent=title;d.append(s);$('fields').append(d);groups.set(title,d);}
    const label=document.createElement('label');label.textContent=labels[key] || key.replaceAll('_',' ');let input;
    if(selects[key]){input=document.createElement('select');selects[key].forEach((text,i)=>input.add(new Option(text,i+(key==='bad_mode'?1:0))));}
    else {input=document.createElement('input');input.type='number';input.step='1';input.min=bounds[key][0];input.max=bounds[key][1];input.required=true;}
    input.name=key;input.value=value;label.append(input);groups.get(title).append(label);
  }
}
export function plot(series, {unit='', label='Simulation time series', offerEnd=0, burstStart=0, burstEnd=0,bands=[]}={}) {
  const W=window.innerWidth<=600?Math.max(320,window.innerWidth-60):850,H=250,L=80,R=20,T=26,B=38;
  const points=[...series.flatMap(s=>s.points),...bands.flatMap(b=>[...b.low,...b.high])], maxT=Math.max(1,...points.map(p=>p[0])),maxY=Math.max(unit==='XPI / kB'?0.000001:1,...points.map(p=>p[1]));
  const x=t=>L+(W-L-R)*t/maxT,y=v=>T+(H-T-B)*(1-v/maxY);
  let out=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}; ${unit}; seconds"><text x="${L}" y="16">${unit}</text>`;
  if(burstEnd>burstStart && burstStart<maxT) out+=`<rect x="${x(burstStart)}" y="${T}" width="${x(Math.min(maxT,burstEnd))-x(burstStart)}" height="${H-T-B}" fill="#b98432" opacity=".07"/>`;
  for(let i=0;i<=4;i++){const value=maxY*(1-i/4);out+=`<line x1="${L}" x2="${W-R}" y1="${y(value)}" y2="${y(value)}" stroke="#e7ebe2"/><text x="${L-9}" y="${y(value)+4}" text-anchor="end">${number(value)}</text><text x="${x(maxT*i/4)}" y="${H-12}" text-anchor="middle">${number(maxT*i/4000)}s</text>`;}
  for(const b of bands) out+=`<polygon points="${[...b.high,...b.low.slice().reverse()].map(p=>`${x(p[0])},${y(p[1])}`).join(' ')}" fill="${b.color}" opacity=".12"/>`;
  for(const s of series){let pp=s.points;if(s.step)pp=pp.flatMap((p,i)=>i?[[p[0],pp[i-1][1]],p]:[p]);out+=`<polyline points="${pp.map(p=>`${x(p[0])},${y(p[1])}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dash?'stroke-dasharray="'+s.dash+'"':''}/>`;}
  if(offerEnd>0&&offerEnd<maxT)out+=`<line x1="${x(offerEnd)}" x2="${x(offerEnd)}" y1="${T}" y2="${H-B}" stroke="#434e48" stroke-dasharray="3 4"/><text x="${Math.min(W-145,x(offerEnd)+5)}" y="${T+13}">Arrivals stop → drain</text>`;
  return out+'</svg>';
}
export function turns(values) {let direction=0,count=0;for(let i=1;i<values.length;i++){const d=Math.sign(values[i]-values[i-1]);if(d&&direction&&d!==direction)count++;if(d)direction=d;}return count;}
function buckets(c){const budget=(c.outcomes.budget_blocked||0)+(c.outcomes.net_min_blocked||0);return [c.confirmed,budget,c.pending-budget,c.expired];}
function outcomeCard(s,c){
  const title=c.name==='human'?'Human payments':c.name==='background'?'Background traffic':'Higher-bidding traffic';
  const card=document.createElement('article');card.className='card '+(c.name==='human'?'human-card':'background-card');
  card.innerHTML=`<h2>${title} · ${s.name==='reactive'?'Reactive quotes':'Fixed bids'}</h2><div class="big">${number(c.confirmed)} / ${number(c.sent)}</div><p class="metric-label">confirmed unique payments${c.sent?' · '+number(Math.round(10000*c.confirmed/c.sent)/100)+'%':''}</p><p>${number(c.confirmed_at_offered_end)} confirmed by ${number(s.offered_end_ms/1000)}s when arrivals stopped; ${number(c.confirmed-c.confirmed_at_offered_end)} more during drain. Snapshot: ${number(s.elapsed_ms/1000)}s.</p>`;
  const bar=document.createElement('div');bar.className='outcome-bar';bar.setAttribute('role','img');const labels=['Confirmed','Budget-limited now','Waiting for service','Explicit deadline expired'];const values=buckets(c);bar.setAttribute('aria-label',values.map((v,i)=>`${labels[i]}: ${v} of ${c.sent}`).join('; '));values.forEach((v,i)=>{const span=document.createElement('span');span.style.width=(c.sent?100*v/c.sent:0)+'%';span.style.backgroundColor=colors[i];span.title=`${labels[i]}: ${v}`;bar.append(span);});card.append(bar);
  const legend=document.createElement('div');legend.className='outcome-legend';legend.innerHTML=values.map((v,i)=>`<span><i class="swatch" style="background:${colors[i]}"></i>${labels[i]}: <strong>${number(v)}</strong></span>`).join('');card.append(legend);
  const detail=document.createElement('details');detail.className='result-details';const causes=Object.entries(c.outcomes).filter(([k,v])=>v&&k!=='confirmed').map(([k,v])=>`${k.replaceAll('_',' ')}: ${number(v)}`).join(' · ');
  detail.innerHTML=`<summary>What is still waiting?</summary><p>${causes||'No unresolved payments.'}</p><p>Oldest waiting payment: ${c.pending_age_max_ms==null?'none':number(c.pending_age_max_ms/1000)+'s'}; median waiting age: ${c.pending_age_p50_ms==null?'none':number(c.pending_age_p50_ms/1000)+'s'}. Unique outcome categories sum to sent. Budget-limited means the current quote does not fit, not permanent failure. Repeated attempt counters are in diagnostics below.</p>`;card.append(detail);return card;
}
export function walletAnswers(scenarios, config){
  $('cards').replaceChildren();$('background').replaceChildren();$('costs').replaceChildren();
  for(const s of scenarios){for(const c of s.classes){if(c.name==='human')$('cards').append(outcomeCard(s,c));else if(c.sent)$('background').append(outcomeCard(s,c));}
    const c=s.classes[0];const card=document.createElement('article');card.className='card cost-card';
    card.innerHTML=`<h2>${s.name==='reactive'?'Reactive quotes':'Fixed bids'} · recipient cost</h2><div class="cost-primary">${money(c.fee_p50_atoms)}</div><p>Median fee across ${number(c.confirmed)} confirmed ordinary payments only.</p><dl class="outcome-grid"><dt>95th percentile fee</dt><dd>${money(c.fee_p95_atoms)}</dd><dt>Largest paid fee</dt><dd>${money(c.fee_max_atoms)}</dd><dt>Fee cap</dt><dd>${money(c.budget_atoms)}</dd><dt>Gross per payment</dt><dd>${money(config.gross_payment_atoms)}</dd><dt>Net at median fee</dt><dd>${c.fee_p50_atoms==null?'—':money(config.gross_payment_atoms-c.fee_p50_atoms)}</dd><dt>Payments over cap</dt><dd>${number(c.overspend)}</dd></dl>`;$('costs').append(card);
  }
  const r=scenarios.find(s=>s.name==='reactive'),f=scenarios.find(s=>s.name==='fixed'),h=r.classes[0],b=r.classes[1];
  say('payment-answer',`Reactive wallets confirmed ${number(h.confirmed)} of ${number(h.sent)} ordinary payments; fixed bids confirmed ${number(f.classes[0].confirmed)} on the same arrivals. ${number(buckets(h)[1])} ordinary payments are currently budget-limited and ${number(buckets(h)[2])} still wait for service. This is a finite experiment, not a guarantee under continuing overload.`);
  say('cost-answer',`Both strategies use the same ${money(config.gross_payment_atoms)} gross payment. Fees come out of that amount, never from an extra charge; ${number(scenarios.reduce((n,s)=>n+s.classes[0].overspend,0))} ordinary payments exceeded their cap. Display profile: 1 XPI = 1,000,000 atoms; no live chain metadata or exchange rate is loaded.`);
  say('background-answer',`Reactive background traffic confirmed ${number(b.confirmed)} of ${number(b.sent)} payments: ${number(buckets(b)[1])} are budget-limited now, ${number(buckets(b)[2])} await service, and ${number(b.expired)} reached an explicit deadline. These synthetic classes describe budgets and demand, not identities known to miners.`);
  say('load-answer',describeWorkload(config));
  const series=[];scenarios.forEach((s,i)=>['human','background'].forEach((n,j)=>series.push({color:i?'#398468':'#ba8058',dash:j?'5 4':'',points:s.trace.map(p=>[p.t_ms,p[n+'_pending']||0])})));
  $('traffic-chart').innerHTML=plot(series,{unit:'Unresolved payments',label:'How many human and background payments are still waiting?',offerEnd:config.duration_s*1000,burstStart:config.burst_start_s*1000,burstEnd:Math.min(config.duration_s,config.burst_end_s)*1000});
  say('traffic-legend','Amber: fixed bids · Green: reactive quotes · Solid: ordinary payments · Dashed: background · Shaded time: offered burst · Vertical line: arrivals stop, then drain. Counts include wallet-deferred payments, not just mempool entries.');
}
