import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 10,
  duration: "5s",
};

export default function () {
  const res = http.get("http://localhost:3000/co2-high");

  check(res, { "status was 200": (r) => r.status == 200 });
  check(res, { "response was correct": (r) => r.body == "2787" });
}
