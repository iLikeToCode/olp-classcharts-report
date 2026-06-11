import { StudentClient } from "classcharts-api";
import ejs from "ejs";
import fs from "fs/promises";
import 'dotenv/config';

const client = new StudentClient(
  process.env.CLASSCHARTS_CODE,
  process.env.CLASSCHARTS_DOB
);

await client.login();

const activity = [];
let last_id;

function generate_timeline(item, daily, weekly, monthly) {
  const date = item.timestamp.slice(0, 10);

  daily[date] = (daily[date] ?? 0) + item.score;

  const month = date.slice(0, 7);
  monthly[month] = (monthly[month] ?? 0) + item.score;

  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  d.setDate(d.getDate() + diff);

  const weekStart = d.toISOString().slice(0, 10);

  weekly[weekStart] = (weekly[weekStart] ?? 0) + item.score;
}

let total_positive = 0;
let total_positive_lessons = 0;

let positive_types = {};
let positive_types_lessons = {};

let daily_timeline = {};
let weekly_timeline = {};
let monthly_timeline = {};
let daily_timeline_lessons = {};
let weekly_timeline_lessons = {};
let monthly_timeline_lessons = {};

let teachers = {};

while (true) {
  const response = await client.getActivity({
    from: "2025-09-01",
    to: "2026-06-05",
    last_id
  });

  const items = response.data;

  if (!items || items.length === 0) {
    break;
  }

  activity.push(...items);

  const nextLastId = items.at(-1)?.id;

  // no progression = stop
  if (!nextLastId || nextLastId === last_id) {
    break;
  }

  last_id = nextLastId;

  items.forEach(item => {
    if (item.score <= 0) return;

    total_positive += item.score;

    positive_types[item.reason] = {
      score: item.score,
      total_score: (positive_types[item.reason]?.total_score ?? 0) + item.score,
      count: (positive_types[item.reason]?.count ?? 0) + 1,
    };

    generate_timeline(item, daily_timeline, weekly_timeline, monthly_timeline);

    teachers[item.teacher_name] = {
      points: (teachers[item.teacher_name]?.points ?? 0) + item.score,
      points_lessons: (teachers[item.teacher_name]?.points_lessons ?? 0)
    };

    let ignore = [
      "attended enrichment",
      "representing the utc",
      "completed homework",
      "positive phone call home"
    ];

    if (ignore.includes(item.reason.toLowerCase())
        || item.lesson_name == undefined) return;

    teachers[item.teacher_name] = {
      points: teachers[item.teacher_name].points,
      points_lessons: (teachers[item.teacher_name]?.points_lessons ?? 0) + item.score
    };

    positive_types_lessons[item.reason] = {
      score: item.score,
      total_score: (positive_types[item.reason]?.total_score ?? 0) + item.score,
      count: (positive_types[item.reason]?.count ?? 0) + 1
    };

    total_positive_lessons += item.score;

    generate_timeline(item, daily_timeline_lessons, weekly_timeline_lessons, monthly_timeline_lessons);
  });
}

console.log(`Fetched ${activity.length} activity points`);

weekly_timeline = Object.entries(weekly_timeline)
  .sort(([a], [b]) => a.localeCompare(b));

const labels = weekly_timeline.map(([date]) => date);
const positive = weekly_timeline.map(([, score]) => score);


weekly_timeline_lessons = Object.entries(weekly_timeline_lessons)
  .sort(([a], [b]) => a.localeCompare(b));

const positive_lessons = weekly_timeline_lessons.map(([, score]) => score);

const info = await client.getStudentInfo();

const report = {
  generated: new Date().toISOString(),
  info: info.data.user,
  summary: {
    positive: total_positive,
    positive_lessons: total_positive_lessons
  },
  timeline: { labels, positive, positive_lessons },
  teachers
};
//console.log(report)

await fs.mkdir(`report-${info.data.user.name.replaceAll(" ", "-")}`, { recursive: true });
await fs.writeFile(`report-${info.data.user.name.replaceAll(" ", "-")}/report.json`, JSON.stringify(report, null, 2));

const html = await ejs.renderFile("template.ejs", {
    report,
    positive_types
});

await fs.writeFile(`report-${info.data.user.name.replaceAll(" ", "-")}/index.html`, html);

console.log(`Generated report-${info.data.user.name.replaceAll(" ", "-")}`);
