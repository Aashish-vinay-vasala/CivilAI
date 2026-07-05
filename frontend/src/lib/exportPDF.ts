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

// ---------------------------------------------------------------------------
// Inline-bold markdown renderer for jsPDF
// Handles **bold** segments, numbered section headers, bullet lines
// ---------------------------------------------------------------------------
function pdfMarkdown(
  doc: jsPDF,
  text: string,
  marginX: number,
  startY: number,
  maxW: number,
): number {
  const BODY_SZ  = 9;
  const HEAD_SZ  = 10.5;
  const LINE_H   = 4.8;
  const HEAD_H   = 5.8;
  let y = startY;

  const newPage = () => { doc.addPage(); y = 22; };

  for (const raw of text.split('\n')) {
    if (y > 272) newPage();

    const line = raw.trimEnd();
    if (!line.trim()) { y += 2.5; continue; }

    // ── Section header: **1. Title** or **Title** alone at line start
    const hMatch = line.match(/^\*\*(\d+\.\s+[^*]+|\w[^*]*)\*\*(.*)$/);
    if (hMatch) {
      y += 3;
      if (y > 272) newPage();
      doc.setFontSize(HEAD_SZ);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(59, 130, 246);
      const title = (hMatch[1] + hMatch[2].replace(/\*\*/g, '')).trim();
      const wrapped = doc.splitTextToSize(title, maxW);
      doc.text(wrapped, marginX, y);
      y += wrapped.length * HEAD_H + 1;
      doc.setFontSize(BODY_SZ);
      doc.setTextColor(51, 65, 85);
      continue;
    }

    // ── Bullet prefix
    const bulletMatch = line.match(/^(\s*[-•]\s+)(.*)/);
    const indent   = bulletMatch ? 5 : 0;
    const drawX    = marginX + indent;
    const drawW    = maxW - indent;
    const content  = bulletMatch ? bulletMatch[2] : line;
    if (bulletMatch) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(BODY_SZ);
      doc.setTextColor(51, 65, 85);
      doc.text('•', marginX + 1, y);
    }

    // ── Split into bold / normal segments
    const segs = content.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    const hasBold = segs.some(s => s.startsWith('**') && s.endsWith('**'));

    if (!hasBold) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(BODY_SZ);
      doc.setTextColor(51, 65, 85);
      const wrapped = doc.splitTextToSize(content, drawW);
      if (y + wrapped.length * LINE_H > 272) newPage();
      doc.text(wrapped, drawX, y);
      y += wrapped.length * LINE_H;
      continue;
    }

    // ── Inline bold: word-level wrap
    type Tok = { word: string; bold: boolean };
    const tokens: Tok[] = [];
    for (const seg of segs) {
      const isBold = seg.startsWith('**') && seg.endsWith('**');
      const inner  = isBold ? seg.slice(2, -2) : seg;
      const words  = inner.split(/(\s+)/);
      for (const w of words) {
        if (!w || /^\s+$/.test(w)) continue;
        tokens.push({ word: w, bold: isBold });
      }
    }

    doc.setFontSize(BODY_SZ);
    let curX    = drawX;
    let lineUsed = 0;
    const spaceW = (doc.setFont('helvetica', 'normal'), doc.getTextWidth(' '));

    for (let ti = 0; ti < tokens.length; ti++) {
      const { word, bold } = tokens[ti];
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      const wW = doc.getTextWidth(word);
      const gap = lineUsed > 0 ? spaceW : 0;

      if (lineUsed > 0 && lineUsed + gap + wW > drawW) {
        y += LINE_H;
        if (y > 272) newPage();
        curX     = drawX;
        lineUsed = 0;
      }

      doc.setTextColor(51, 65, 85);
      doc.text(word, curX, y);
      curX     += wW + spaceW;
      lineUsed += wW + spaceW;
    }
    y += LINE_H;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  return y;
}

export const exportScenarioAnalysisPDF = (
  analysisText: string,
  scenarios:    any[],
  evmSnapshot:  { cpi: number; spi: number; ac: number; ev: number; bac: number } | null,
  projectName:  string,
) => {
  const doc = new jsPDF();
  const marginX = 14;
  const pageW   = 210;
  const maxW    = pageW - marginX * 2;

  addHeader(doc, 'Scenario Analysis Report', projectName);
  let y = 50;

  // ── EVM snapshot ──────────────────────────────────────────────────────────
  if (evmSnapshot) {
    doc.setFillColor(30, 41, 59);
    doc.rect(marginX, y, maxW, 8, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Live EVM Context', marginX + 2, y + 5.5);
    y += 12;

    autoTable(doc, {
      startY: y,
      body: [
        ['CPI', evmSnapshot.cpi.toFixed(2), 'SPI', evmSnapshot.spi.toFixed(2)],
        ['Actual Cost (AC)', `$${(evmSnapshot.ac / 1000).toFixed(0)}K`, 'Earned Value (EV)', `$${(evmSnapshot.ev / 1000).toFixed(0)}K`],
        ['Budget at Completion', `$${(evmSnapshot.bac / 1000000).toFixed(2)}M`, '', ''],
      ],
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [51, 65, 85], cellWidth: 50 },
        2: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [51, 65, 85], cellWidth: 50 },
      },
      margin: { left: marginX, right: marginX },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── Scenario comparison table ─────────────────────────────────────────────
  doc.setFillColor(30, 41, 59);
  doc.rect(marginX, y, maxW, 8, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Scenario Comparison', marginX + 2, y + 5.5);
  y += 4;

  const fmt = (v: number) => v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000)}K`;

  autoTable(doc, {
    startY: y + 8,
    head: [['Scenario', 'Budget', 'Duration', 'Total Est.', 'Monthly Burn', 'Labour %', 'Contingency %']],
    body: scenarios.map(s => {
      const total   = s.budget * (1 + s.contingencyPct / 100);
      const monthly = total / Math.max(s.duration, 1);
      return [
        s.name || '—',
        fmt(s.budget),
        `${s.duration} mo`,
        fmt(total),
        fmt(monthly) + '/mo',
        `${s.laborCostPct}%`,
        `${s.contingencyPct}%`,
      ];
    }),
    theme: 'striped',
    headStyles:  { fillColor: [59, 130, 246], textColor: 255, fontSize: 9 },
    styles:      { fontSize: 8, cellPadding: 2.5 },
    margin:      { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // ── AI Analysis ───────────────────────────────────────────────────────────
  if (y > 240) { doc.addPage(); y = 22; }

  doc.setFillColor(30, 41, 59);
  doc.rect(marginX, y, maxW, 8, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('AI Scenario Analysis', marginX + 2, y + 5.5);
  y += 14;

  y = pdfMarkdown(doc, analysisText, marginX, y, maxW);

  addFooter(doc);
  const date = new Date().toISOString().split('T')[0];
  doc.save(`CivilAI_Scenario_Analysis_${projectName.replace(/\s+/g, '_')}_${date}.pdf`);
};

export const exportAIReportPDF = (
  reportText: string,
  reportType: string,
  projectName: string,
) => {
  const doc = new jsPDF();
  const marginX = 14;
  const pageW   = 210;
  const maxW    = pageW - marginX * 2;

  const titleMap: Record<string, string> = {
    weekly:      "Weekly Progress Report",
    stakeholder: "Stakeholder Report",
    kpi:         "KPI Report",
    safety:      "Safety Report",
  };
  const title = titleMap[reportType] || "AI Report";

  addHeader(doc, title, projectName);
  let y = 50;

  y = pdfMarkdown(doc, reportText, marginX, y, maxW);

  addFooter(doc);
  const date = new Date().toISOString().split("T")[0];
  doc.save(`CivilAI_${title.replace(/\s+/g, "_")}_${projectName.replace(/\s+/g, "_")}_${date}.pdf`);
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
    headStyles: { fillColor: [0, 212, 255], textColor: 255, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 3 },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc);
  doc.save(`CivilAI_MLOps_Report_${new Date().toISOString().split("T")[0]}.pdf`);
};