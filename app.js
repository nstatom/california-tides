const API_BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const APPLICATION = "California_Tides";
let selectedStation = STATIONS[0].id;
let units = "english";
let displayTime = "local";
const COLORS = ["#1261a0", "#c65d2e", "#3a8f65", "#7a5aa6", "#b28a2e", "#277f91", "#a34f78", "#5d7d3b", "#8a6f35", "#486a8a", "#9b6844"];
const $ = id => document.getElementById(id);

function localDateString(date) {
  const parts = new Intl.DateTimeFormat("en-US", {timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const p = Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function addDays(date, days) { const d=new Date(date); d.setUTCDate(d.getUTCDate()+days); return d; }
function initializeControls() {
  const stationSelect=$("stationSelect");
  STATIONS.forEach(s=>{const o=document.createElement("option");o.value=s.id;o.textContent=s.name;stationSelect.appendChild(o);});
  stationSelect.value=selectedStation;
  const now=new Date(); $("startDate").value=localDateString(now); $("endDate").value=localDateString(addDays(now,7));
  stationSelect.addEventListener("change",async e=>{selectedStation=e.target.value; await loadObservations(); emphasizePrediction();});
  $("localBtn").addEventListener("click",async()=>{if(displayTime!=="local"){displayTime="local";updateTimeButtons();await redrawAll();}});
  $("utcBtn").addEventListener("click",async()=>{if(displayTime!=="gmt"){displayTime="gmt";updateTimeButtons();await redrawAll();}});
  $("englishBtn").addEventListener("click",async()=>{if(units!=="english"){units="english";updateUnitButtons();await loadAll();}});
  $("metricBtn").addEventListener("click",async()=>{if(units!=="metric"){units="metric";updateUnitButtons();await loadAll();}});
  $("updatePredictions").addEventListener("click",loadPredictions);
}
function updateUnitButtons(){$("englishBtn").classList.toggle("active",units==="english");$("metricBtn").classList.toggle("active",units==="metric");}
function updateTimeButtons(){$("localBtn").classList.toggle("active",displayTime==="local");$("utcBtn").classList.toggle("active",displayTime==="gmt");}
function setStatus(message,error=false){const el=$("status");el.textContent=message;el.classList.toggle("error",error);}
function formatDateForApi(v){return v.replaceAll("-","");}

// Request NOAA timestamps in the currently selected display timezone.
// Predictions and observations therefore arrive already aligned with the user's selected clock.
async function apiRequest(params){
  const url=new URL(API_BASE);
  const timeZone=displayTime==="gmt"?"gmt":"lst_ldt";
  Object.entries({...params,application:APPLICATION,format:"json",time_zone:timeZone}).forEach(([k,v])=>url.searchParams.set(k,v));
  const response=await fetch(url.toString());
  if(!response.ok) throw new Error(`NOAA API returned HTTP ${response.status}`);
  const json=await response.json();
  if(json.error) throw new Error(json.error.message||"NOAA API error");
  return json;
}
function parseNoaaTime(t){
  if(!t)return null;
  const m=String(t).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if(!m)return null;
  const y=+m[1],mo=+m[2],d=+m[3],h=+m[4],mi=+m[5],sec=+(m[6]||0);
  if(displayTime==="gmt")return new Date(Date.UTC(y,mo-1,d,h,mi,sec));
  return localDateTimeUtc(y,mo,d,h,mi,sec);
}
function localDateTimeUtc(year,month,day,hour,minute,second){
  const target=Date.UTC(year,month-1,day,hour,minute,second);
  let t=target;
  for(let i=0;i<6;i++){
    const p=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).formatToParts(new Date(t));
    const q=Object.fromEntries(p.map(x=>[x.type,x.value]));
    const shown=Date.UTC(+q.year,+q.month-1,+q.day,q.hour==="24"?0:+q.hour,+q.minute,+q.second);
    const delta=target-shown;
    t+=delta;
    if(Math.abs(delta)<1000)break;
  }
  return new Date(t);
}

function displayParts(date){
  const tz=displayTime==="gmt"?"UTC":"America/Los_Angeles";
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(date);
  return Object.fromEntries(parts.map(x=>[x.type,x.value]));
}
function displayHoverTime(date){
  const tz=displayTime==="gmt"?"UTC":"America/Los_Angeles";
  return new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false,timeZoneName:"short"}).format(date);
}
function tickText(date){
  const p=displayParts(date);
  return `${p.month}/${p.day}<br>${p.hour}:${p.minute}`;
}
function timeZoneParts(date){
  const tz=displayTime==="gmt"?"UTC":"America/Los_Angeles";
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).formatToParts(date);
  return Object.fromEntries(parts.map(x=>[x.type,x.value]));
}
function localMidnightUtc(year,month,day){
  const target=Date.UTC(year,month-1,day,0,0,0);
  let t=target;
  for(let i=0;i<5;i++){
    const p=timeZoneParts(new Date(t));
    const shown=Date.UTC(+p.year,+p.month-1,+p.day,p.hour==="24"?0:+p.hour,+p.minute,+p.second);
    t+=target-shown;
  }
  return new Date(t);
}
function dailyMidnightTickValues(xs){
  const valid=xs.filter(x=>x instanceof Date && !Number.isNaN(x.getTime()));
  if(!valid.length)return [];
  const min=new Date(Math.min(...valid.map(x=>x.getTime())));
  const max=new Date(Math.max(...valid.map(x=>x.getTime())));
  const first=timeZoneParts(min), last=timeZoneParts(max);
  const cursor=new Date(Date.UTC(+first.year,+first.month-1,+first.day));
  const end=new Date(Date.UTC(+last.year,+last.month-1,+last.day));
  const ticks=[];
  while(cursor<=end){
    ticks.push(localMidnightUtc(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,cursor.getUTCDate()));
    cursor.setUTCDate(cursor.getUTCDate()+1);
  }
  return ticks;
}
function tickSpec(xs){
  const vals=dailyMidnightTickValues(xs);
  return vals.length?{tickmode:"array",tickvals:vals,ticktext:vals.map(tickText)}:{};
}
function recordsToXY(data,valueKey="v"){return(data||[]).map(r=>({x:parseNoaaTime(r.t),y:Number(r[valueKey])})).filter(r=>r.x&&!Number.isNaN(r.y));}

function baseLayout(yTitle,extra={}){return{margin:{l:64,r:24,t:8,b:58},paper_bgcolor:"white",plot_bgcolor:"white",font:{family:"system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",size:12,color:"#26343f"},hovermode:"x unified",showlegend:true,legend:{orientation:"h",y:-.18,x:0,bgcolor:"rgba(255,255,255,.8)"},xaxis:{showgrid:true,gridcolor:"#e8edf0",zeroline:false,showline:false,mirror:false,...extra.xaxis},yaxis:{title:yTitle,showgrid:true,gridcolor:"#e8edf0",zeroline:false,showline:false,mirror:false},...extra};}
function plotConfig(){return{responsive:true,displaylogo:false,modeBarButtonsToRemove:["lasso2d","select2d","autoScale2d"]};}

async function loadPredictions(){
  const start=$("startDate").value,end=$("endDate").value;
  if(!start||!end||start>=end){setStatus("Please enter a valid prediction start and end date.",true);return;}
  setStatus("Loading tidal predictions…");
  try{
    const results=[];
    for(let i=0;i<STATIONS.length;i++){
      if(i)await sleep(100);
      const station=STATIONS[i];
      const json=await apiRequest({begin_date:formatDateForApi(start),end_date:formatDateForApi(end),station:station.id,product:"predictions",datum:"MLLW",interval:"15",units});
      const rows=json.predictions||[];
      results.push({station,rows});
    }
    const traces=results.map((r,i)=>{
      const xy=recordsToXY(r.rows),active=r.station.id===selectedStation;
      return{x:xy.map(p=>p.x),y:xy.map(p=>p.y),name:r.station.name,mode:"lines",line:{color:COLORS[i],width:active?3.2:1.15},opacity:active?1:.62,customdata:xy.map(p=>displayHoverTime(p.x)),hovertemplate:`${r.station.name}: %{y:.2f} ${units==="english"?"ft":"m"}<extra></extra>`,legendgroup:r.station.id};
    });
    Plotly.react("predictionPlot",traces,baseLayout(units==="english"?"ft MLLW":"m MLLW",{height:570,xaxis:tickSpec(traces.flatMap(t=>t.x||[]))}),plotConfig());
    setStatus(`Predictions loaded for ${start} through ${end}.`);
  }catch(e){console.error(e);setStatus(`Unable to load predictions: ${e.message}`,true);}
}
function setObservationSubtitles(){
  const n=STATIONS.find(s=>s.id===selectedStation)?.name||"Selected station";
  ["waterLevelSubtitle","waterTempSubtitle","windSubtitle","airTempSubtitle"].forEach(id=>{
    const el=$(id); if(el)el.textContent=`${n} · previous 72 hours of observations`;
  });
}
function setCardVisible(id,visible){
  const el=$(id); if(el)el.style.display=visible?"":"none";
}
function clearObservationPlots(){
  [
    ["waterLevelCard","waterLevelPlot"],["waterTempCard","waterTempPlot"],
    ["windCard","windPlot"],["airTempCard","airTempPlot"]
  ].forEach(([card,plot])=>{setCardVisible(card,false);const el=$(plot);if(el)Plotly.purge(el);});
}
async function loadObservations(){
  const station=STATIONS.find(s=>s.id===selectedStation);
  setObservationSubtitles();
  setStatus(`Loading the last 72 hours for ${station.name}…`);
  clearObservationPlots();
  const common={date:"recent",station:selectedStation,units};
  const products=[
    ["water_level",{product:"water_level",datum:"MLLW"}],
    ["water_temperature",{product:"water_temperature"}],
    ["wind",{product:"wind"}],
    ["air_temperature",{product:"air_temperature"}],
    ["humidity",{product:"humidity"}]
  ];
  const responses={};
  const failures=[];
  for(let i=0;i<products.length;i++){
    if(i)await sleep(100);
    const [name,extra]=products[i];
    try{responses[name]=await apiRequest({...common,...extra});}
    catch(e){console.warn(`${name} unavailable for ${station.name}:`,e.message);responses[name]={};failures.push(name);}
  }
  const results=[
    drawWaterLevel(responses.water_level.data||[]),
    drawSingleSeries("waterTempPlot","waterTempCard",responses.water_temperature.data||[],"Water temperature",units==="english"?"°F":"°C"),
    drawWind(responses.wind.data||[]),
    drawAirTempHumidity(responses.air_temperature.data||[],responses.humidity.data||[]),
  ];
  updateObservationSummary(responses);
  const missing=results.filter(x=>!x).length;
  if(failures.length||missing){
    setStatus(`Observations loaded for ${station.name}; some observations are unavailable.`);
  }else{
    setStatus(`Observations loaded for ${station.name}.`);
  }
}
function drawWaterLevel(data){
  const xy=recordsToXY(data);
  if(!xy.length){setCardVisible("waterLevelCard",false);return false;}
  setCardVisible("waterLevelCard",true);
  const unit=units==="english"?"ft MLLW":"m MLLW";
  Plotly.react("waterLevelPlot",[{x:xy.map(p=>p.x),y:xy.map(p=>p.y),mode:"lines",name:"Water level",line:{color:"#1261a0",width:1.8},customdata:xy.map(p=>displayHoverTime(p.x)),hovertemplate:`%{y:.2f} ${units==="english"?"ft":"m"}<extra></extra>`}],baseLayout(unit,{height:400,showlegend:false,xaxis:tickSpec(xy.map(p=>p.x))}),plotConfig());
  return true;
}
function drawWind(data){
  const speed=data.map(r=>({x:parseNoaaTime(r.t),y:Number(r.s)})).filter(p=>p.x&&!Number.isNaN(p.y));
  const gust=data.map(r=>({x:parseNoaaTime(r.t),y:Number(r.g)})).filter(p=>p.x&&!Number.isNaN(p.y));
  const direction=data.map(r=>({x:parseNoaaTime(r.t),y:Number(r.d)})).filter(p=>p.x&&!Number.isNaN(p.y));
  if(!speed.length&&!gust.length&&!direction.length){setCardVisible("windCard",false);return false;}
  setCardVisible("windCard",true);
  const unit=units==="english"?"knots":"m/s";
  const xAll=[...speed,...gust,...direction].map(p=>p.x);
  const traces=[];
  if(speed.length)traces.push({x:speed.map(p=>p.x),y:speed.map(p=>p.y),mode:"lines",name:"Speed",line:{color:"#1261a0",width:1.8},customdata:speed.map(p=>displayHoverTime(p.x)),hovertemplate:`Speed: %{y:.1f} ${unit}<extra></extra>`});
  if(gust.length)traces.push({x:gust.map(p=>p.x),y:gust.map(p=>p.y),mode:"lines",name:"Gust",line:{color:"#c65d2e",width:1.1,dash:"dot"},customdata:gust.map(p=>displayHoverTime(p.x)),hovertemplate:`Gust: %{y:.1f} ${unit}<extra></extra>`});
  const hasDirection=direction.length;
  if(hasDirection)traces.push({x:direction.map(p=>p.x),y:direction.map(p=>p.y),mode:"markers",name:"Direction",marker:{size:5,opacity:.75},yaxis:"y2",customdata:direction.map(p=>displayHoverTime(p.x)),hovertemplate:"Direction: %{y:.0f}°<extra></extra>"});
  const extra={height:400,margin:{l:64,r:hasDirection?100:24,t:8,b:58},xaxis:tickSpec(xAll)};
  if(hasDirection){extra.yaxis2={title:{text:"Direction (°)",standoff:18},overlaying:"y",side:"right",range:[0,360],dtick:90,showgrid:false,showline:false,mirror:false};}
  Plotly.react("windPlot",traces,baseLayout(speed.length||gust.length?unit:null,extra),plotConfig());
  return true;
}
function drawSingleSeries(element,card,data,name,yUnit){
  const xy=recordsToXY(data);
  if(!xy.length){setCardVisible(card,false);return false;}
  setCardVisible(card,true);
  Plotly.react(element,[{x:xy.map(p=>p.x),y:xy.map(p=>p.y),mode:"lines",name,line:{color:"#1261a0",width:1.8},customdata:xy.map(p=>displayHoverTime(p.x)),hovertemplate:`%{y:.2f} ${yUnit}<extra></extra>`}],baseLayout(yUnit,{height:400,showlegend:false,xaxis:tickSpec(xy.map(p=>p.x))}),plotConfig());
  return true;
}
function drawAirTempHumidity(tempData,humidityData){
  const temp=recordsToXY(tempData);
  const humidity=recordsToXY(humidityData);
  if(!temp.length&&!humidity.length){setCardVisible("airTempCard",false);return false;}
  setCardVisible("airTempCard",true);
  const tempUnit=units==="english"?"°F":"°C";
  const traces=[];
  if(temp.length)traces.push({x:temp.map(p=>p.x),y:temp.map(p=>p.y),mode:"lines",name:"Air temperature",line:{color:"#1261a0",width:1.8},customdata:temp.map(p=>displayHoverTime(p.x)),hovertemplate:`Air temperature: %{y:.2f} ${tempUnit}<extra></extra>`});
  if(humidity.length)traces.push({x:humidity.map(p=>p.x),y:humidity.map(p=>p.y),mode:"lines",name:"Humidity",line:{color:"#c65d2e",width:1.8},yaxis:"y2",customdata:humidity.map(p=>displayHoverTime(p.x)),hovertemplate:"Humidity: %{y:.1f} %<extra></extra>"});
  const both=temp.length&&humidity.length;
  const xAll=[...temp,...humidity].map(p=>p.x);
  const extra={height:400,margin:{l:64,r:both?90:24,t:8,b:58},xaxis:tickSpec(xAll)};
  if(both){
    traces[1].yaxis="y2";
    extra.yaxis={title:`Air temperature (${tempUnit})`,showgrid:true,gridcolor:"#e8edf0",zeroline:false,showline:false,mirror:false};
    extra.yaxis2={title:{text:"Humidity (%)",standoff:18},overlaying:"y",side:"right",showgrid:false,showline:false,mirror:false};
  }else if(temp.length){
    extra.yaxis={title:`Air temperature (${tempUnit})`,showgrid:true,gridcolor:"#e8edf0",zeroline:false,showline:false,mirror:false};
  }else{
    delete traces[0].yaxis;
    extra.yaxis={title:"Humidity (%)",showgrid:true,gridcolor:"#e8edf0",zeroline:false,showline:false,mirror:false};
  }
  Plotly.react("airTempPlot",traces,baseLayout(temp.length?`Air temperature (${tempUnit})`:"Humidity (%)",extra),plotConfig());
  return true;
}
function latestRecord(data,valueKey="v"){
  const rows=(data||[]).map(r=>({x:parseNoaaTime(r.t),y:Number(r[valueKey])})).filter(p=>p.x&&!Number.isNaN(p.y));
  return rows.length?rows[rows.length-1]:null;
}
function updateObservationSummary(responses){
  const el=$("observationSummary"), card=$("observationSummaryCard");
  if(!el)return;
  const items=[];
  const water=latestRecord(responses.water_level?.data||[]);
  const waterTemp=latestRecord(responses.water_temperature?.data||[]);
  const windRows=responses.wind?.data||[];
  const wind=windRows.length?windRows[windRows.length-1]:null;
  const air=latestRecord(responses.air_temperature?.data||[]);
  const humidity=latestRecord(responses.humidity?.data||[]);
  if(water)items.push(["Water Level",`${water.y.toFixed(2)} ${units==="english"?"ft":"m"}`]);
    // Tide trend is based on the last two valid water-level observations.
  const wl=(responses.water_level?.data||[]).map(r=>({x:parseNoaaTime(r.t),y:Number(r.v)})).filter(p=>p.x&&!Number.isNaN(p.y));
  if(wl.length>=2){
    const a=wl[wl.length-2],b=wl[wl.length-1],dt=(b.x-a.x)/60000;
    const rate=dt>0?(b.y-a.y)/dt:0;
    const threshold=units==="english"?0.002:0.0006;
    const trend=Math.abs(rate)<threshold?"Steady":rate>0?"Rising":"Falling";
    items.push(["Tide Trend",trend]);
  }
  if(waterTemp)items.push(["Water Temperature",`${waterTemp.y.toFixed(1)} ${units==="english"?"°F":"°C"}`]);
  if(wind){
    const speed=Number(wind.s),gust=Number(wind.g),dir=Number(wind.d);
    if(!Number.isNaN(speed))items.push(["Wind Speed",`${speed.toFixed(1)} ${units==="english"?"kt":"m/s"}`]);
    if(!Number.isNaN(gust))items.push(["Wind Gust",`${gust.toFixed(1)} ${units==="english"?"kt":"m/s"}`]);
    if(!Number.isNaN(dir))items.push(["Wind Direction",`${dir.toFixed(0)}°`]);
  }
  if(air)items.push(["Air Temperature",`${air.y.toFixed(1)} ${units==="english"?"°F":"°C"}`]);
  if(humidity)items.push(["Humidity",`${humidity.y.toFixed(0)} %`]);
  el.innerHTML=items.map(([label,value])=>`<div class="summary-item"><div class="summary-label">${label}</div><div class="summary-value">${value}</div></div>`).join("");
  if(card)card.style.display=items.length?"":"none";
  el.style.display=items.length?"grid":"none";
}
function emphasizePrediction(){const plot=$("predictionPlot");if(!plot||!plot.data)return;plot.data.forEach((_,i)=>{const active=STATIONS[i]?.id===selectedStation;Plotly.restyle("predictionPlot",{"line.width":active?3.2:1.15,opacity:active?1:.62},[i]);});}
async function redrawAll(){await loadPredictions();await loadObservations();}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function loadAll(){setStatus("Updating data…");await loadPredictions();await loadObservations();}
document.addEventListener("DOMContentLoaded",async()=>{initializeControls();updateUnitButtons();updateTimeButtons();await loadAll();});
