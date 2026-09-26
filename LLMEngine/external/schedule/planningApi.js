const axios = require("axios");
const { config } = require("../../../utilities/config");

const DAY_MAP = { m: "monday", tu: "tuesday", w: "wednesday", th: "thursday", f: "friday" };
const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const REQUEST_TIMEOUT_MS = 15000;

// Room numbers encode the floor: B012, B115, B203.
function floorOf(room) {
  const number = parseInt(room.toUpperCase().replace(/^B/, ""), 10);
  if (Number.isNaN(number)) return "other";
  if (number < 100) return "ground";
  if (number < 200) return "first";
  return "second";
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function orderDays(data) {
  const ordered = {};
  for (const day of DAY_ORDER) {
    if (data[day]) ordered[day] = data[day];
  }
  for (const day of Object.keys(data)) {
    if (!ordered[day]) ordered[day] = data[day];
  }
  return ordered;
}

function toApiError(err) {
  if (err.response) {
    return new Error(`Planning API error (${err.response.status}): ${JSON.stringify(err.response.data)}`);
  }
  if (err.request) return new Error("Network error: the planning API did not respond.");
  return err;
}

class PlanningApi {
  constructor(baseUrl = config.planning?.apiBaseUrl) {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, params) {
    try {
      const res = await axios.get(`${this.baseUrl}${endpoint}`, { params, timeout: REQUEST_TIMEOUT_MS });
      return res.data;
    } catch (err) {
      throw toApiError(err);
    }
  }

  async getCourses({ year, week, dept, train_prog, groupe }) {
    if (!dept || !train_prog || !groupe) {
      throw new Error("Missing parameters: dept, train_prog and groupe are required.");
    }
    const courses = await this.request("/api/get-schedules", {
      year,
      week,
      dept: dept.toUpperCase(),
      train_prog: train_prog.toUpperCase(),
      groupe: groupe.toUpperCase(),
    });
    if (!Array.isArray(courses)) throw new Error("Planning API returned an unexpected payload.");
    return courses;
  }

  async getSchedules(params) {
    return this.formatCourses(await this.getCourses(params));
  }

  async getFreeRooms({ year, week, dept }) {
    if (!dept) throw new Error("Missing parameter: dept is required.");
    const raw = await this.request("/api/get-free-rooms", { year, week, dept: dept.toUpperCase() });
    return this.formatFreeRooms(raw);
  }

  // Returns { rooms: { day: { "HH:MM": { floor: [...] } } } }.
  formatFreeRooms(raw) {
    const byDay = {};
    for (const [dayCode, slots] of Object.entries(raw.salles || {})) {
      const day = DAY_MAP[dayCode] || dayCode;
      byDay[day] = {};
      for (const [slot, rooms] of Object.entries(slots)) {
        const roomList = Array.isArray(rooms) ? rooms.map(String) : Object.keys(rooms || {});
        const floors = {};
        for (const room of roomList) {
          (floors[floorOf(room)] ||= []).push(room);
        }
        byDay[day][minutesToTime(Number(slot))] = floors;
      }
    }
    return { rooms: orderDays(byDay), lastUpdated: raw.lastUpdated };
  }

  formatCourses(courses) {
    const byDay = {};
    for (const course of courses) {
      const day = DAY_MAP[course.date.day] || course.date.day;
      (byDay[day] ||= []).push({ ...course, start_time_str: minutesToTime(course.start_time), day_str: day });
    }
    for (const day of Object.keys(byDay)) {
      byDay[day].sort((a, b) => a.start_time - b.start_time);
    }
    return orderDays(byDay);
  }
}

module.exports = PlanningApi;
