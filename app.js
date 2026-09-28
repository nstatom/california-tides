const API_BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const APPLICATION = "California_Tides";
let selectedStation = STATIONS[0].id;
let units = "english";
let displayTime = "gmt";
const COLORS = ["#1261a0", "#c65d2e", "#3a8f65", "#7a5aa6", "#b28a2e", "#277f91", "#a34f78", "#5d7d3b", "#8a6f35"];
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
  const now=new Date(); $("startDate").value=localDateString(addDays(now,-2)); $("endDate").value=localDateString(addDays(now,5));
  stationSelect.addEventListener("change",async e=>{selectedStation=e.target.value; await loadObservations(); emphasizePrediction();});
  $("utcBtn").addEventListener("click",async()=>{if(displayTime!=="gmt"){displayTime="gmt";updateTimeButtons();await redrawAll();}});
  $("localBtn").addEventListener("click",async()=>{if(displayTime!=="local"){displayTime="local";updateTimeButtons();await redrawAll();}});
  $("englishBtn").addEventListener("click",async()=>{if(units!=="english"){units="english";updateUnitButtons();await loadAll();}});
  $("metricBtn").addEventListener("click",async()=>{if(units!=="metric"){units="metric";updateUnitButtons();await loadAll();}});
  $("updatePredictions").addEventListener("click",loadPredictions);
}
function updateUnitButtons(){$("englishBtn").classList.toggle("active",units==="english");$("metricBtn").classList.toggle("active",units==="metric");}
function updateTimeButtons(){$("utcBtn").classList.toggle("active",displayTime==="gmt");$("localBtn").classList.toggle("active",displayTime==="local");}
function setStatus(message,error=false){const el=$("status");el.textContent=message;el.classList.toggle("error",error);}
function formatDateForApi(v){return v.replaceAll("-","");}

// Always request NOAA data in GMT. The timestamps remain real UTC Date objects.
// We control the displayed clock labels explicitly, avoiding double timezone shifts.
async function apiRequest(params){
  const url=new URL(API_BASE);
  Object.entries({...params,application:APPLICATION,format:"json",time_zone:"gmt"}).forEach(([k,v])=>url.searchParams.set(k,v));
  const response=await fetch(url.toString());
  if(!response.ok) throw new Error(`NOAA API returned HTTP ${response.status}`);
  const json=await response.json();
  if(json.error) throw new Error(json.error.message||"NOAA API error");
  return json;
}
function parseNoaaTime(t){
  if(!t) return null;
  const m=String(t).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if(!m) return null;
  return new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0)));
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
function tickText(date){const p=displayParts(date);return `${p.month}/${p.day}<br>${p.hour}:${p.minute}`;}
function tickSpec(xs){
  const valid=xs.filter(Boolean); if(!valid.length)return {};
  const min=valid[0].getTime(), max=valid[valid.length-1].getTime();
  const step=(max-min)/7;
  const vals=Array.from({length:8},(_,i)=>new Date(min+step*i));
  return {tickmode:"array",tickvals:vals,ticktext:vals.map(tickText)};
}
function recordsToXY(data,valueKey="v"){return(data||[]).map(r=>({x:parseNoaaTime(r.t),y:Number(r[valueKey])})).filter(r=>r.x&&!Number.isNaN(r.y));}
function baseLayout(yTitle,extra={}){return{margin:{l:64,r:24,t:8,b:58},paper_bgcolor:"white",plot_bgcolor:"white",font:{family:"system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",size:12,color:"#26343f"},hovermode:"x unified",showlegend:true,legend:{orientation:"h",y:-.18,x:0,bgcolor:"rgba(255,255,255,.8)"},xaxis:{showgrid:true,gridcolor:"#e8edf0",zeroline:false,...extra.xaxis},yaxis:{title:yTitle,showgrid:true,gridcolor:"#e8edf0",zeroline:false},...extra};}
function plotConfig(){return{responsive:true,displaylogo:false,modeBarButtonsToRemove:["lasso2d","select2d","autoScale2d"]};}

async function loadPredictions(){
  const start=$("startDate").value,end=$("endDate").value;
  if(!start||!end||start>=end){setStatus("Please enter a valid prediction start and end date.",true);return;}
  setStatus("Loading tidal predictions…");
  try{
    const results=[];
    for(let i=0;i<STATIONS.length;i++){if(i)await sleep(100);const station=STATIONS[i];const json=await apiRequest({begin_date:formatDateForApi(start),end_date:formatDateForApi(end),station:station.id,product:"predictions",datum:"MLLW",interval:"15",units});results.push({station,rows:json.predictions||[]});}
    const traces=results.map((r,i)=>{const xy=recordsToXY(r.rows);const active=r.station.id===selectedStation;return{x:xy.map(p=>p.x),y:xy.map(p=>p.y),name:r.station.name,mode:"lines",line:{color:COLORS[i],width:active?3.2:1.15},opacity:active?1:.62,customdata:xy.map(p=>displayHoverTime(p.x)),hovertemplate:`${r.station.name}<br>%{customdata}<br>%{y:.2f}<extra></extra>`,legendgroup:r.station.id};});
    Plotly.react("predictionPlot",traces,baseLayout(units==="english"?"ft MLLW":"m MLLW",{height:570,xaxis:tickSpec(traces[0]?.x||[])}),plotConfig());
    setStatus(`Predictions loaded for ${start} through ${end}.`);
  }catch(e){console.error(e);setStatus(`Unable to load predictions: ${e.message}`,true);}
}
function setObservationSubtitles(){const n=STATIONS.find(s=>s.id===selectedStation)?.name||"Selected station";["waterLevelSubtitle","windSubtitle","airTempSubtitle","waterTempSubtitle","pressureSubtitle"].forEach(id=>{const el=$(id);if(el)el.textContent=`${n} · previous 72 hours`;});}
async function loadObservations(){
  const station=STATIONS.find(s=>s.id===selectedStation);setObservationSubtitles();setStatus(`Loading the last 72 hours for ${station.name}…`);
  try{
    const common={date:"recent",station:selectedStation,units};
    const products=[["water_level",{product:"water_level",datum:"MLLW"}],["wind",{product:"wind"}],["air_temperature",{product:"air_temperature"}],["water_temperature",{product:"water_temperature"}],["air_pressure",{product:"air_pressure"}]];
    const responses={};for(let i=0;i<products.length;i++){if(i)await sleep(100);const [name,extra]=products[i];responses[name]=await apiRequest({...common,...extra});}
    drawWaterLevel(responses.water_level.data||[]);drawWind(responses.wind.data||[]);drawSingleSeries("airTempPlot",responses.air_temperature.data||[],"Air temperature",units==="english"?"°F":"°C");drawSingleSeries("waterTempPlot",responses.water_temperature.data||[],"Water temperature",units==="english"?"°F":"°C");drawSingleSeries("pressurePlot",responses.air_pressure.data||[],"Atmospheric pressure",units==="english"?"in Hg":"hPa");
    setStatus(`Observations loaded for ${station.name}.`);
  }catch(e){console.error(e);setStatus(`Unable to load observations: ${e.message}`,true);}
}
function drawWaterLevel(data){const xy=recordsToXY(data);Plotly.react("waterLevelPlot",[{x:xy.map(p=>p.x),y:xy.map(p=>p.y),mode:"lines",name:"Water level",line:{color:"#1261a0",width:1.8},customdata:xy.map(p=>displayHoverTime(p.x)),hovertemplate:"%{customdata}<br>%{y:.2f}<extra></extra>"}],baseLayout(units==="english"?"ft MLLW":"m MLLW",{height:400,showlegend:false,xaxis:tickSpec(xy.map(p=>p.x))}),plotConfig());}
function drawWind(data){const speed=data.map(r=>({x:parseNoaaTime(r.t),y:Number(r.s)})).filter(p=>p.x&&!Number.isNaN(p.y));const gust=data.map(r=>({x:parseNoaaTime(r.t),y:Number(r.g)})).filter(p=>p.x&&!Number.isNaN(p.y));const direction=data.map(r=>({x:parseNoaaTime(r.t),y:Number(r.d)})).filter(p=>p.x&&!Number.isNaN(p.y));const unit=units==="english"?"knots":"m/s";Plotly.react("windPlot",[{x:speed.map(p=>p.x),y:speed.map(p=>p.y),mode:"lines",name:"Speed",line:{color:"#1261a0",width:1.8},customdata:speed.map(p=>displayHoverTime(p.x)),hovertemplate:"%{customdata}<br>Speed: %{y:.1f}<extra></extra>"},{x:gust.map(p=>p.x),y:gust.map(p=>p.y),mode:"lines",name:"Gust",line:{color:"#c65d2e",width:1.1,dash:"dot"},customdata:gust.map(p=>displayHoverTime(p.x)),hovertemplate:"%{customdata}<br>Gust: %{y:.1f}<extra></extra>"},{x:direction.map(p=>p.x),y:direction.map(p=>p.y),mode:"markers",name:"Direction",marker:{size:5,opacity:.75},yaxis:"y2",customdata:direction.map(p=>displayHoverTime(p.x)),hovertemplate:"%{customdata}<br>Direction: %{y:.0f}°<extra></extra>"}],baseLayout(unit,{height:400,margin:{l:64,r:100,t:8,b:58},xaxis:tickSpec(speed.map(p=>p.x)),yaxis:{title:unit,showgrid:true,gridcolor:"#e8edf0",zeroline:false},yaxis2:{title:{text:"Direction (°)",standoff:18},overlaying:"y",side:"right",range:[0,360],dtick:90,showgrid:false}}),plotConfig());}
function drawSingleSeries(element,data,name,yUnit){const xy=recordsToXY(data);Plotly.react(element,[{x:xy.map(p=>p.x),y:xy.map(p=>p.y),mode:"lines",name,line:{color:"#1261a0",width:1.8},customdata:xy.map(p=>displayHoverTime(p.x)),hovertemplate:"%{customdata}<br>%{y:.2f}<extra></extra>"}],baseLayout(yUnit,{height:400,showlegend:false,xaxis:tickSpec(xy.map(p=>p.x))}),plotConfig());}
function emphasizePrediction(){const plot=$("predictionPlot");if(!plot||!plot.data)return;plot.data.forEach((_,i)=>{const active=STATIONS[i]?.id===selectedStation;Plotly.restyle("predictionPlot",{"line.width":active?3.2:1.15,opacity:active?1:.62},[i]);});}
async function redrawAll(){await loadPredictions();await loadObservations();}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function loadAll(){setStatus("Updating data…");await loadPredictions();await loadObservations();}
document.addEventListener("DOMContentLoaded",async()=>{initializeControls();updateUnitButtons();updateTimeButtons();await loadAll();});
