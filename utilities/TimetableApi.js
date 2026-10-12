const axios = require("axios");
const { config } = require("./config");

const DAY_MAP = { m: "monday", tu: "tuesday", w: "wednesday", th: "thursday", f: "friday" };
const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const REQUEST_TIMEOUT_MS = 15000;

// Room number hundreds give the floor: B012, 115.
function floorOf(room) {
  const digits = room.match(/\d{3,}/)?.[0];
  return digits ? String(Math.floor(Number(digits) / 100)) : "other";
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
    return new Error(`Timetable API error (${err.response.status}): ${JSON.stringify(err.response.data)}`);
  }
  if (err.request) return new Error("Network error: the timetable API did not respond.");
  return err;
}

const DEFAULT_PATHS = { schedules: "/api/get-schedules", freeRooms: "/api/get-free-rooms" };

class TimetableApi {
  constructor(planning = config.planning || {}) {
    this.baseUrl = planning.apiBaseUrl;
    this.paths = { ...DEFAULT_PATHS, ...planning.paths };
  }

  async request(endpoint, params) {
    try {
      const res = await axios.get(`${this.baseUrl}${endpoint}`, { params, timeout: REQUEST_TIMEOUT_MS });
      return res.data;
    } catch (err) {
      throw toApiError(err);
    }
  }

  async getCourses({ year, week, dept, level, group }) {
    if (!dept || !level || !group) {
      throw new Error("Missing parameters: dept, level and group are required.");
    }
    const courses = await this.request(this.paths.schedules, {
      year,
      week,
      dept: dept.toUpperCase(),
      // The API keeps its own French parameter names.
      train_prog: level.toUpperCase(),
      groupe: group.toUpperCase(),
    });
    if (!Array.isArray(courses)) throw new Error("Timetable API returned an unexpected payload.");
    return courses;
  }

  async getSchedules(params) {
    return this.formatCourses(await this.getCourses(params));
  }

  async getFreeRooms({ year, week, dept }) {
    if (!dept) throw new Error("Missing parameter: dept is required.");
    const raw = await this.request(this.paths.freeRooms, { year, week, dept: dept.toUpperCase() });
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

module.exports = TimetableApi;
