let processes = [];

const processTableBody = document.querySelector("#processTable tbody");
const resultTableBody  = document.querySelector("#resultTable tbody");
const ganttChart       = document.getElementById("ganttChart");
const ganttTimeline    = document.getElementById("ganttTimeline");
const addBtn           = document.getElementById("addProcess");
const algoButtons      = document.querySelectorAll(".algo-buttons button");

function updateCount() {
  document.getElementById("processCount").textContent = `(${processes.length})`;
}

function renderProcesses() {
  processTableBody.innerHTML = "";
  processes.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.pid}</td>
      <td>${p.arrival}</td>
      <td>${p.burst}</td>
      <td>${p.priority}</td>
      <td><button class="delete-btn" data-index="${i}">Delete</button></td>
    `;
    processTableBody.appendChild(tr);
  });

  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index);
      processes.splice(idx, 1);
      renderProcesses();
      updateCount();
    });
  });
}

addBtn.addEventListener("click", () => {
  const pid = document.getElementById("pid").value.trim() || `P${processes.length + 1}`;
  const arrival  = parseInt(document.getElementById("arrival").value)  || 0;
  const burst    = parseInt(document.getElementById("burst").value)    || 1;
  const priority = parseInt(document.getElementById("priority").value) || 1;

  if (burst <= 0) {
    alert("Burst time must be positive.");
    return;
  }

  processes.push({ pid, arrival, burst, priority, originalBurst: burst });
  renderProcesses();
  updateCount();

  // Optional: clear inputs except pid
  document.getElementById("arrival").value = "";
  document.getElementById("burst").value = "";
  document.getElementById("priority").value = "1";
});

function resetResult() {
  document.getElementById("result").classList.add("hidden");
  ganttChart.innerHTML = "";
  ganttTimeline.innerHTML = "";
  resultTableBody.innerHTML = "";
}

function showResult(algoName, schedule, avgTAT, avgWT, avgRT) {
  resetResult();
  document.getElementById("algoName").textContent = `${algoName} Results`;
  document.getElementById("result").classList.remove("hidden");

  // Gantt chart
  let time = 0;
  schedule.forEach(item => {
    const width = item.duration * 8; // pixels per unit time (adjust scale)
    const bar = document.createElement("div");
    bar.className = "gantt-bar";
    bar.style.backgroundColor = getColorForPID(item.pid);
    bar.style.width = width + "px";
    bar.textContent = item.pid;
    ganttChart.appendChild(bar);

    time += item.duration;
  });

  // Timeline
  ganttTimeline.innerHTML = "";
  let currentTime = 0;
  schedule.forEach((item, idx) => {
    const span = document.createElement("span");
    span.textContent = currentTime;
    span.style.marginLeft = (item.duration * 8 - 20) + "px"; // rough centering
    ganttTimeline.appendChild(span);
    currentTime += item.duration;
  });
  // last time
  const last = document.createElement("span");
  last.textContent = currentTime;
  ganttTimeline.appendChild(last);

  // Result table
  processes.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.pid}</td>
      <td>${p.arrival}</td>
      <td>${p.originalBurst}</td>
      <td>${p.completion ?? "–"}</td>
      <td>${p.turnaround ?? "–"}</td>
      <td>${p.waiting ?? "–"}</td>
      <td>${p.response ?? "–"}</td>
    `;
    resultTableBody.appendChild(tr);
  });

  document.getElementById("avgTAT").textContent = avgTAT.toFixed(2);
  document.getElementById("avgWT").textContent  = avgWT.toFixed(2);
  document.getElementById("avgRT").textContent  = avgRT.toFixed(2);
}

function getColorForPID(pid) {
  const colors = ["#10b981","#f59e0b","#ec4899","#8b5cf6","#06b6d4","#f97316","#6366f1","#14b8a6"];
  let hash = 0;
  for (let i = 0; i < pid.length; i++) {
    hash = pid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// ------------------ Scheduling Algorithms ------------------

function runFCFS() {
  const sorted = [...processes].sort((a,b) => a.arrival - b.arrival);
  let time = 0;
  const schedule = [];

  sorted.forEach(p => {
    if (time < p.arrival) time = p.arrival;
    schedule.push({pid: p.pid, start: time, duration: p.burst});
    p.completion = time + p.burst;
    time += p.burst;
  });

  calculateMetrics(sorted);
  const avgTAT = sorted.reduce((sum,p)=>sum+(p.turnaround||0),0)/sorted.length;
  const avgWT  = sorted.reduce((sum,p)=>sum+(p.waiting||0),0) /sorted.length;
  const avgRT  = sorted.reduce((sum,p)=>sum+(p.response||0),0) /sorted.length;

  showResult("First Come First Served (FCFS)", schedule, avgTAT, avgWT, avgRT);
}

function runSJF() {
  let time = 0;
  const ready = [];
  const done = [];
  const schedule = [];
  let remaining = [...processes.map(p => ({...p, remaining: p.burst}))];

  while (done.length < processes.length) {
    // add arrived processes to ready
    remaining.forEach(p => {
      if (p.arrival <= time && p.remaining > 0 && !ready.some(r=>r.pid===p.pid)) {
        ready.push(p);
      }
    });

    if (ready.length === 0) {
      time++;
      continue;
    }

    // select shortest
    ready.sort((a,b) => a.remaining - b.remaining);
    const curr = ready[0];
    const start = time;
    time += curr.remaining;
    schedule.push({pid: curr.pid, start, duration: curr.remaining});

    curr.completion = time;
    curr.remaining = 0;
    done.push(curr);
    ready.shift();
  }

  calculateMetrics(done);
  const avgTAT = done.reduce((s,p)=>s+p.turnaround,0)/done.length;
  const avgWT  = done.reduce((s,p)=>s+p.waiting,0)/done.length;
  const avgRT  = done.reduce((s,p)=>s+(p.response??0),0)/done.length;

  showResult("Shortest Job First (non-preemptive)", schedule, avgTAT, avgWT, avgRT);
}

function runSRTF() {
  let time = 0;
  const schedule = [];
  let remaining = processes.map(p => ({...p, remaining: p.burst}));
  let completed = 0;
  let lastPid = null;

  while (completed < processes.length) {
    let candidates = remaining.filter(p => p.arrival <= time && p.remaining > 0);
    if (candidates.length === 0) {
      time++;
      continue;
    }

    candidates.sort((a,b) => a.remaining - b.remaining);
    const curr = candidates[0];

    if (lastPid !== curr.pid) {
      if (lastPid !== null) {
        // push previous segment
        const lastSeg = schedule[schedule.length-1];
        lastSeg.duration = time - lastSeg.start;
      }
      schedule.push({pid: curr.pid, start: time, duration: 0});
      lastPid = curr.pid;
    }

    curr.remaining--;
    time++;

    if (curr.remaining === 0) {
      curr.completion = time;
      completed++;
      lastPid = null; // force new segment on next
    }
  }

  // close last segment
  if (schedule.length > 0) {
    const last = schedule[schedule.length-1];
    last.duration = time - last.start;
  }

  calculateMetrics(remaining);
  const avgTAT = remaining.reduce((s,p)=>s+p.turnaround,0)/remaining.length;
  const avgWT  = remaining.reduce((s,p)=>s+p.waiting,0)/remaining.length;
  const avgRT  = remaining.reduce((s,p)=>s+(p.response??p.arrival),0)/remaining.length; // approx

  showResult("Shortest Remaining Time First (SRTF)", schedule, avgTAT, avgWT, avgRT);
}

function runPriority() {
  let time = 0;
  const ready = [];
  const done = [];
  const schedule = [];
  let remaining = [...processes.map(p=>({...p, remaining: p.burst}))];

  while (done.length < processes.length) {
    remaining.forEach(p => {
      if (p.arrival <= time && p.remaining > 0 && !ready.some(r=>r.pid===p.pid)) {
        ready.push(p);
      }
    });

    if (ready.length === 0) {
      time++;
      continue;
    }

    ready.sort((a,b) => a.priority - b.priority); // lower number = higher priority
    const curr = ready[0];
    const start = time;
    time += curr.remaining;

    schedule.push({pid: curr.pid, start, duration: curr.remaining});

    curr.completion = time;
    curr.remaining = 0;
    done.push(curr);
    ready.shift();
  }

  calculateMetrics(done);
  const avgTAT = done.reduce((s,p)=>s+p.turnaround,0)/done.length;
  const avgWT  = done.reduce((s,p)=>s+p.waiting,0)/done.length;
  const avgRT  = done.reduce((s,p)=>s+(p.response??0),0)/done.length;

  showResult("Priority Scheduling (non-preemptive)", schedule, avgTAT, avgWT, avgRT);
}

function runRR() {
  const q = parseInt(document.getElementById("quantum").value) || 4;
  let time = 0;
  const queue = [];
  const schedule = [];
  let remaining = processes.map(p => ({...p, remaining: p.burst}));
  let arrived = new Set();

  // initial enqueue
  remaining.forEach(p => { if (p.arrival === 0) queue.push(p); });

  while (queue.length > 0 || remaining.some(p=>p.remaining>0)) {
    // add newly arrived
    remaining.forEach(p => {
      if (p.arrival <= time && p.remaining > 0 && !arrived.has(p.pid)) {
        queue.push(p);
        arrived.add(p.pid);
      }
    });

    if (queue.length === 0) {
      time++;
      continue;
    }

    const curr = queue.shift();
    const exec = Math.min(q, curr.remaining);
    const start = time;

    schedule.push({pid: curr.pid, start, duration: exec});

    time += exec;
    curr.remaining -= exec;

    // re-enqueue if not finished
    if (curr.remaining > 0) {
      queue.push(curr);
    } else {
      curr.completion = time;
    }
  }

  calculateMetrics(remaining);
  const avgTAT = remaining.reduce((s,p)=>s+p.turnaround,0)/remaining.length;
  const avgWT  = remaining.reduce((s,p)=>s+p.waiting,0)/remaining.length;
  const avgRT  = remaining.reduce((s,p)=>s+(p.response??0),0)/remaining.length;

  showResult(`Round Robin (q = ${q})`, schedule, avgTAT, avgWT, avgRT);
}

function calculateMetrics(procs) {
  procs.forEach(p => {
    p.turnaround = p.completion - p.arrival;
    p.waiting    = p.turnaround - p.originalBurst;
    p.response   = p.response !== undefined ? p.response : p.waiting; // first wait = response for non-pre
  });
}

// Algorithm button handlers
algoButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    if (processes.length === 0) {
      alert("Please add at least one process.");
      return;
    }

    const algo = btn.dataset.algo;

    // reset previous results on processes
    processes.forEach(p => {
      delete p.completion;
      delete p.turnaround;
      delete p.waiting;
      delete p.response;
    });

    if (algo === "fcfs") runFCFS();
    else if (algo === "sjf") runSJF();
    else if (algo === "srtf") runSRTF();
    else if (algo === "priority") runPriority();
    else if (algo === "rr") runRR();
  });
});
