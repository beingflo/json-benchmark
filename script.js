import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 10,
  duration: "10s",
};

export default function () {
  const res = http.post("http://localhost:3000/", {
    data: "{ temperature: 12.3, humidity: 52.8 }",
    timestamp: new Date().toISOString(),
  });
  check(res, { "status was 200": (r) => r.status == 200 });
}
