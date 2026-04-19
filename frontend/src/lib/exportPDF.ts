import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";

const addHeader = (doc: jsPDF, title: string, subtitle?: string) => {
  // Background header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 40, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("CivilAI", 14, 16);

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184);
  doc.text("AI-Powered Construction Management", 14, 24);

  // Report title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(59, 130, 246);
  doc.text(title, 14, 34);

  if (subtitle) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(subtitle, 140, 34);
  }

  // Date
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  })}`, 140, 26);
};

const addFooter = (doc: jsPDF) => {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 285, 210, 12, "F");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("CivilAI — Confidential", 14, 292);
    doc.text(`Page ${i} of ${pageCount}`, 180, 292);
  }
};

export const exportProjectReport = (project: any, tasks: any[], incidents: any[], equipment: any[]) => {
  const doc = new jsPDF();
  addHeader(doc, "Project Report", project?.name || "All Projects");

  let y = 48;

  // Project Summary
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.setFillColor(30, 41, 59);
  doc.rect(14, y, 182, 8, "F");
  doc.text("Project Summary", 16, y + 5.5);
  y += 12;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  const projectInfo = [
    ["Project Name", project?.name || "—"],
    ["Location", project?.location || "—"],
    ["Status", project?.status || "—"],
    ["Budget", `$${((project?.total_budget || 0) / 1000000).toFixed(1)}M`],
    ["Progress", `${project?.progress_percentage || 0}%`],
    ["Start Date", project?.start_date || "—"],
    ["End Date", project?.end_date || "—"],
  ];

  autoTable(doc, {
    startY: y,
    body: projectInfo,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [241, 245, 249], textColor: [51, 65, 85], cellWidth: 50 },
      1: { textColor: [15, 23, 42] },
    },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Tasks
  if (tasks.length > 0) {
    doc.setFillColor(30, 41, 59);
    doc.rect(14, y, 182, 8, "F");
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("Schedule Tasks", 16, y + 5.5);
    y += 4;

    autoTable(doc, {
      startY: y + 8,
      head: [["Task", "Phase", "Assignee", "Progress", "Status", "Start", "End"]],
      body: tasks.map(t => [
        t.task_name || "—",
        t.phase || "—",
        t.assignee || "—",
        `${t.actual_progress || 0}%`,
        t.status || "—",
        t.planned_start || "—",
        t.planned_end || "—",
      ]),
      theme: "striped",
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2.5 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Safety Incidents
  if (incidents.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFillColor(30, 41, 59);
    doc.rect(14, y, 182, 8, "F");
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("Safety Incidents", 16, y + 5.5);
    y += 4;

    autoTable(doc, {
      startY: y + 8,
      head: [["Type", "Location", "Date", "Severity", "Status"]],
      body: incidents.map(i => [
        i.incident_type || "—",
        i.location || "—",
        i.date || "—",
        i.severity || "—",
        i.status || "—",
      ]),
      theme: "striped",
      headStyles: { fillColor: [239, 68, 68], textColor: 255, fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2.5 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Equipment
  if (equipment.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFillColor(30, 41, 59);
    doc.rect(14, y, 182, 8, "F");
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("Equipment Status", 16, y + 5.5);
    y += 4;

    autoTable(doc, {
      startY: y + 8,
      head: [["Name", "Type", "Health", "Status", "Last Service", "Next Service"]],
      body: equipment.map(e => [
        e.name || "—",
        e.equipment_type || "—",
        `${e.health_score || 0}%`,
        e.status || "—",
        e.last_maintenance || "—",
        e.next_service || "—",
      ]),
      theme: "striped",
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2.5 },
      margin: { left: 14, right: 14 },
    });
  }

  addFooter(doc);
  doc.save(`CivilAI_Project_Report_${project?.name || "Report"}_${new Date().toISOString().split("T")[0]}.pdf`);
};

export const exportScheduleReport = (tasks: any[], projectName: string) => {
  const doc = new jsPDF();
  addHeader(doc, "Schedule Report", projectName);

  const completed = tasks.filter(t => t.status === "done" || t.status === "completed").length;
  const delayed = tasks.filter(t => t.status === "delayed").length;
  const avgProgress = tasks.length > 0
    ? Math.round(tasks.reduce((s, t) => s + (t.actual_progress || 0), 0) / tasks.length)
    : 0;

  // Summary stats
  autoTable(doc, {
    startY: 48,
    body: [
      ["Total Tasks", tasks.length.toString(), "Completed", completed.toString()],
      ["Delayed", delayed.toString(), "Avg Progress", `${avgProgress}%`],
    ],
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 4, halign: "center" },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [241, 245, 249] },
      2: { fontStyle: "bold", fillColor: [241, 245, 249] },
    },
    margin: { left: 14, right: 14 },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 10,
    head: [["#", "Task Name", "Phase", "Assignee", "Planned %", "Actual %", "Status", "Delay"]],
    body: tasks.map((t, i) => [
      i + 1,
      t.task_name || "—",
      t.phase || "—",
      t.assignee || "—",
      `${t.planned_progress || 0}%`,
      `${t.actual_progress || 0}%`,
      t.status || "—",
      t.delay_days > 0 ? `${t.delay_days}d` : "—",
    ]),
    theme: "striped",
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2.5 },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc);
  doc.save(`CivilAI_Schedule_${projectName}_${new Date().toISOString().split("T")[0]}.pdf`);
};

export const exportSafetyReport = (incidents: any[], projectName: string) => {
  const doc = new jsPDF();
  addHeader(doc, "Safety Report", projectName);

  const severe = incidents.filter(i => i.severity === "Severe").length;
  const moderate = incidents.filter(i => i.severity === "Moderate").length;
  const open = incidents.filter(i => i.status === "open").length;

  autoTable(doc, {
    startY: 48,
    body: [
      ["Total Incidents", incidents.length.toString(), "Severe", severe.toString()],
      ["Moderate", moderate.toString(), "Open Cases", open.toString()],
    ],
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 4, halign: "center" },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [241, 245, 249] },
      2: { fontStyle: "bold", fillColor: [241, 245, 249] },
    },
    margin: { left: 14, right: 14 },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 10,
    head: [["#", "Type", "Location", "Date", "Severity", "Status", "Description"]],
    body: incidents.map((inc, i) => [
      i + 1,
      inc.incident_type || "—",
      inc.location || "—",
      inc.date || "—",
      inc.severity || "—",
      inc.status || "—",
      (inc.description || "—").substring(0, 40),
    ]),
    theme: "striped",
    headStyles: { fillColor: [239, 68, 68], textColor: 255, fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2.5 },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc);
  doc.save(`CivilAI_Safety_${projectName}_${new Date().toISOString().split("T")[0]}.pdf`);
};

export const exportEquipmentReport = (equipment: any[], projectName: string) => {
  const doc = new jsPDF();
  addHeader(doc, "Equipment Report", projectName);

  const operational = equipment.filter(e => e.status === "operational").length;
  const critical = equipment.filter(e => e.status === "critical").length;
  const avgHealth = equipment.length > 0
    ? Math.round(equipment.reduce((s, e) => s + (e.health_score || 0), 0) / equipment.length)
    : 0;

  autoTable(doc, {
    startY: 48,
    body: [
      ["Total Equipment", equipment.length.toString(), "Operational", operational.toString()],
      ["Critical", critical.toString(), "Avg Health", `${avgHealth}%`],
    ],
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 4, halign: "center" },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [241, 245, 249] },
      2: { fontStyle: "bold", fillColor: [241, 245, 249] },
    },
    margin: { left: 14, right: 14 },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 10,
    head: [["#", "Name", "Type", "Health %", "Status", "Last Service", "Next Service", "Hours"]],
    body: equipment.map((e, i) => [
      i + 1,
      e.name || "—",
      e.equipment_type || "—",
      `${e.health_score || 0}%`,
      e.status || "—",
      e.last_maintenance || "—",
      e.next_service || "—",
      e.operating_hours || "—",
    ]),
    theme: "striped",
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2.5 },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc);
  doc.save(`CivilAI_Equipment_${projectName}_${new Date().toISOString().split("T")[0]}.pdf`);
};

export const exportMLOpsReport = (runs: any[], predStats: any) => {
  const doc = new jsPDF();
  addHeader(doc, "MLOps Report", "Model Performance");

  autoTable(doc, {
    startY: 48,
    head: [["Model", "Accuracy", "F1 Score", "AUC", "Status", "Date"]],
    body: runs.map(r => [
      r.name || "—",
      r.accuracy ? `${r.accuracy}%` : "—",
      r.f1 || "—",
      r.auc || "—",
      r.status || "—",
      r.timestamp || "—",
    ]),
    theme: "striped",
    headStyles: { fillColor: [139, 92, 246], textColor: 255, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 3 },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc);
  doc.save(`CivilAI_MLOps_Report_${new Date().toISOString().split("T")[0]}.pdf`);
};