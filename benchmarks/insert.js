import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 10,
  duration: "5s",
};

export default function () {
  const res = http.post(
    "http://localhost:3000/",
    JSON.stringify({
      data: { temperature: 12.3, co2: 2 },
      type: "co2",
      timestamp: new Date().toISOString(),
    }),
    { headers: { "Content-Type": "application/json" } }
  );

  check(res, { "status was 200": (r) => r.status == 200 });
}
