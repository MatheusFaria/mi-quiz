import assert from "node:assert/strict";
import test from "node:test";
import { sheetsAdapter, TabNotFoundError } from "../index.js";

const respond = (status, data) => ({ ok: status < 400, status, json: async () => data });

test("sheets adapter writes RAW with quoted ranges and parses the appended row", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, body: init.body && JSON.parse(init.body) });
    return respond(200, { updates: { updatedRange: "'My Tab'!A7:C7" } });
  };
  const adapter = sheetsAdapter({ spreadsheetId: "S", getToken: () => "t", fetch });

  assert.equal(await adapter.append("My Tab", [["x"]]), 7);
  assert.match(calls[0].url, /valueInputOption=RAW/);
  assert.match(decodeURIComponent(calls[0].url), /'My Tab':append/);

  await adapter.updateRows("My Tab", [{ row: 3, col: 27, values: ["v"] }]);
  assert.equal(calls[1].body.valueInputOption, "RAW");
  assert.equal(calls[1].body.data[0].range, "'My Tab'!AB3");
});

test("sheets adapter reports a missing tab", async () => {
  const fetch = async () => respond(400, { error: { message: "Unable to parse range: 'x'" } });
  const adapter = sheetsAdapter({ spreadsheetId: "S", getToken: () => "t", fetch });
  await assert.rejects(adapter.readAll("x"), TabNotFoundError);
});
