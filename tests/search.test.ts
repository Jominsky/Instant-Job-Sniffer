import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearch } from "@/lib/searchQuery";

test("spec example: 'Summer 2027 SWE internship NYC Python'", () => {
  const p = parseSearch("Summer 2027 SWE internship NYC Python");
  assert.equal(p.filters.season, "Summer"); assert.equal(p.filters.year, "2027"); assert.equal(p.filters.exp, "INTERNSHIP");
  assert.equal(p.filters.role, "SWE,BACKEND,FRONTEND,FULL_STACK,INFRASTRUCTURE,DISTRIBUTED_SYSTEMS");
  assert.equal(p.filters.location, "New York"); assert.equal(p.filters.techAll, "Python"); assert.deepEqual(p.terms, []);
});
test("spec example: 'quant internships Chicago'", () => {
  const p = parseSearch("quant internships Chicago");
  assert.equal(p.filters.role, "QUANT_DEVELOPER,QUANT_RESEARCH,QUANT_TRADING"); assert.equal(p.filters.exp, "INTERNSHIP"); assert.equal(p.filters.location, "Chicago");
});
test("spec example: 'jobs requiring C++ posted today' keeps C++ intact and uses posted date", () => {
  const p = parseSearch("jobs requiring C++ posted today");
  assert.equal(p.filters.techAll, "C++"); assert.equal(p.filters.postedWithin, "1440"); assert.equal(p.filters.discoveredWithin, undefined); assert.deepEqual(p.terms, []);
});
test("spec example: a bare company name stays free text", () => {
  const p = parseSearch("Palantir"); assert.deepEqual(p.terms, ["palantir"]); assert.deepEqual(p.filters, {}); assert.equal(p.wantsCompanies, false);
});
test("spec example: 'companies with internships discovered this week'", () => {
  const p = parseSearch("companies with internships discovered this week");
  assert.equal(p.wantsCompanies, true); assert.equal(p.filters.exp, "INTERNSHIP"); assert.equal(p.filters.discoveredWithin, "10080"); assert.equal(p.filters.postedWithin, undefined); assert.deepEqual(p.terms, []);
});
test("specific quant roles beat the generic quant match", () => {
  assert.equal(parseSearch("quant developer intern").filters.role, "QUANT_DEVELOPER");
  assert.equal(parseSearch("quant research").filters.role, "QUANT_RESEARCH");
  assert.equal(parseSearch("quant trader").filters.role, "QUANT_TRADING");
});
test("'Spring' alone is not a season (Spring Boot), but with a year it is", () => {
  const a = parseSearch("spring boot java"); assert.equal(a.filters.season, undefined); assert.deepEqual(a.terms, ["spring", "boot"]); assert.equal(a.filters.techAll, "Java");
  const b = parseSearch("spring 2028 intern"); assert.equal(b.filters.season, "Spring"); assert.equal(b.filters.year, "2028");
});
test("numeric windows, multiple technologies, multiple cities, quoted phrases", () => {
  assert.equal(parseSearch("last 3 hours").filters.discoveredWithin, "180");
  assert.equal(parseSearch("posted in the last 2 days").filters.postedWithin, "2880");
  assert.equal(parseSearch("python c++ linux").filters.techAll, "Python,C++,Linux");
  assert.equal(parseSearch("nyc chicago philly").filters.location, "New York|Chicago|Philadelphia");
  assert.deepEqual(parseSearch('"market making" python').terms, ["market making"]);
});
test("new grad / remote / empty input / term cap", () => {
  const p = parseSearch("new grad remote backend"); assert.equal(p.filters.exp, "NEW_GRAD"); assert.equal(p.filters.remote, "1"); assert.equal(p.filters.role, "BACKEND");
  assert.deepEqual(parseSearch("   "), { terms: [], filters: {}, wantsCompanies: false, explained: [] });
  assert.equal(parseSearch("a1 b2 c3 d4 e5 f6 g7 h8 i9 j10").terms.length, 8);
});
test("never loses words it does not understand", () => {
  assert.deepEqual(parseSearch("blockchain quant").terms, ["blockchain"]);
});
