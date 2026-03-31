// js/app.js
function drawClock(canvasId, tz, digitalId) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const now = new Date();
  const zoned = new Date(now.toLocaleString('en-US',{timeZone:tz}));

  const h=zoned.getHours(), m=zoned.getMinutes(), s=zoned.getSeconds();

  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.beginPath(); ctx.arc(180,180,150,0,Math.PI*2);
  ctx.fillStyle='#1c1c1e'; ctx.fill();

  function hand(angle,len,w){
    ctx.beginPath();
    ctx.moveTo(180,180);
    ctx.lineTo(180+Math.cos(angle)*len,180+Math.sin(angle)*len);
    ctx.lineWidth=w; ctx.strokeStyle='#fff'; ctx.stroke();
  }

  hand((h%12+m/60)*Math.PI/6-Math.PI/2,70,6);
  hand((m+s/60)*Math.PI/30-Math.PI/2,100,4);
  hand(s*Math.PI/30-Math.PI/2,120,2);

  document.getElementById(digitalId).textContent = `${h}:${m}:${s}`;
}

setInterval(()=>{
  drawClock('clock-sydney','Australia/Sydney','digital-sydney');
  drawClock('clock-seoul','Asia/Seoul','digital-seoul');
},1000);

async function fetchNow(){
  try{
    const res = await fetch('/now');
    const d = await res.json();
    const el = document.getElementById('nowPlaying');

    if(!d.title){ el.classList.remove('active'); return; }

    el.classList.add('active');
    document.getElementById('trackName').textContent=d.title;
    document.getElementById('artistName').textContent=d.artist;
  }catch{}
}
setInterval(fetchNow,3000);