import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
	BUDGET_CHARS,
	buildPrompt,
	contextText,
	DEFAULT_ROLE,
	descriptionText,
	NO_DESCRIPTION,
	OMISSION_MARKER,
	prepareBrief,
	REDACTIONS,
	type Redaction,
	ROLE_CAP,
	roleText,
	routingState,
	TOKEN_PREFIXES,
} from "./brief.ts";

const CALIBRATION = new URL("../../calibration.jsonl", import.meta.url);

// BUDGET_CHARS 12000, marker 31 characters: head floor(2/3 * 11969), tail the rest.
const HEAD_CHARS = 7979;
const TAIL_CHARS = 3990;

test("a short text comes back unchanged", () => {
	const text = "Create src/hello.ts and run the tests.";
	assert.equal(prepareBrief(text), text);
});

test("a text of exactly the budget comes back unchanged", () => {
	const text = "x".repeat(BUDGET_CHARS);
	assert.equal(prepareBrief(text), text);
});

test("a text one character over the budget is cut to exactly the budget", () => {
	const out = prepareBrief("x".repeat(BUDGET_CHARS + 1));
	assert.equal(out.length, BUDGET_CHARS);
	assert.ok(out.includes(OMISSION_MARKER));
});

test("the marker is fixed and counts toward the budget", () => {
	assert.equal(OMISSION_MARKER, "\n[middle of the brief omitted]\n");
	assert.equal(OMISSION_MARKER.length, 31);
});

test("the head gets two thirds of the remaining characters and the tail the rest", () => {
	const text = `${"h".repeat(BUDGET_CHARS)}${"t".repeat(BUDGET_CHARS)}`;
	const out = prepareBrief(text);
	const [head, tail] = out.split(OMISSION_MARKER);
	assert.equal(head, "h".repeat(HEAD_CHARS));
	assert.equal(tail, "t".repeat(TAIL_CHARS));
	assert.equal(out.length, BUDGET_CHARS);
});

test("the head and the tail are the ends of the text", () => {
	const middle = "m".repeat(BUDGET_CHARS);
	const out = prepareBrief(`START${middle}END`);
	assert.ok(out.startsWith("START"));
	assert.ok(out.endsWith("END"));
});

test("code blocks and blank lines shrink before the cut, so a short result is not cut", () => {
	const code = `\`\`\`ts\n${"const a = 1\n".repeat(BUDGET_CHARS)}\`\`\``;
	const out = prepareBrief(`a\n\n\n\nb ${code}\nc`);
	assert.equal(
		out,
		`a\n\nb [an exact block of ${BUDGET_CHARS} lines is given verbatim]\nc`,
	);
});

// The secret moves across the cut one character at a time, so every split of it is tried.
const SECRETS = ["API_KEY=Zq9fK2mTvv", "sk-Zq9fK2mTvvQ8"];
const SECRET_PIECES = /Zq|Tvv/;
const SWEEP = 20;

test("a secret that straddles the head cut never appears", () => {
	for (const secret of SECRETS)
		for (let shift = 0; shift < SWEEP; shift++) {
			const text = `${"x".repeat(HEAD_CHARS - shift)} ${secret} ${"y".repeat(BUDGET_CHARS)}`;
			assert.doesNotMatch(prepareBrief(text), SECRET_PIECES);
		}
});

test("a secret that straddles the tail cut never appears", () => {
	for (const secret of SECRETS)
		for (let shift = 0; shift < SWEEP; shift++) {
			const text = `${"y".repeat(BUDGET_CHARS)} ${secret} ${"x".repeat(TAIL_CHARS - shift)}`;
			assert.doesNotMatch(prepareBrief(text), SECRET_PIECES);
		}
});

test("a secret inside a code block is redacted before the block collapses", () => {
	const out = prepareBrief("```\nAPI_KEY=Zq9fK2mTvv\n```");
	assert.doesNotMatch(out, /Zq/);
});

const SMALL_BUDGET = 600;
const SMALL_HEAD_CHARS = 379;
const SMALL_TAIL_CHARS = 190;

test("a smaller budget cuts to exactly that length with the marker counted", () => {
	const text = `${"h".repeat(BUDGET_CHARS)}${"t".repeat(BUDGET_CHARS)}`;
	const out = prepareBrief(text, SMALL_BUDGET);
	const [head, tail] = out.split(OMISSION_MARKER);
	assert.equal(out.length, SMALL_BUDGET);
	assert.equal(head, "h".repeat(SMALL_HEAD_CHARS));
	assert.equal(tail, "t".repeat(SMALL_TAIL_CHARS));
});

test("a text within a smaller budget comes back unchanged", () => {
	const text = "x".repeat(SMALL_BUDGET);
	assert.equal(prepareBrief(text, SMALL_BUDGET), text);
});

test("a smaller budget still redacts before it cuts", () => {
	for (let shift = 0; shift < SWEEP; shift++) {
		const text = `${"x".repeat(SMALL_HEAD_CHARS - shift)} API_KEY=Zq9fK2mTvv ${"y".repeat(BUDGET_CHARS)}`;
		assert.doesNotMatch(prepareBrief(text, SMALL_BUDGET), SECRET_PIECES);
	}
});

test("a JSON-quoted or single-quoted secret name still masks its value", () => {
	assert.equal(
		prepareBrief("{\"API_KEY\": \"abc123\"} and {'API_KEY': 'abc123'}"),
		"{\"API_KEY\": ***} and {'API_KEY': ***}",
	);
});

test("a quoted value with spaces is masked whole, closed or not", () => {
	assert.equal(
		prepareBrief('export API_KEY="abc def ghi"'),
		"export API_KEY=***",
	);
	assert.equal(prepareBrief('export API_KEY="abc def'), "export API_KEY=***");
});

test("the Bearer scheme is matched in any case", () => {
	assert.equal(prepareBrief("send with bearer abc123"), "send with Bearer ***");
});

test("assignments to names ending in key, token, secret or password are masked in any case", () => {
	const task = prepareBrief(
		'api_key=hunter22 and apiKey: "sw0rdf1sh" and password=letmein',
	);
	for (const masked of ["api_key=***", "apiKey: ***", "password=***"])
		assert.ok(task.includes(masked));
	for (const secret of ["hunter22", "sw0rdf1sh", "letmein"])
		assert.ok(!task.includes(secret));
});

// The context is capped at 3000 characters and added only when 500 fit after the task and the 17-character label.
const CONTEXT_CAP_CHARS = 3000;

test("the prompt holds the task first and the capped context after it", () => {
	const task = "Do the thing";
	const brief = buildPrompt(task, "C".repeat(10000));
	assert.ok(brief.startsWith(task));
	const tail = brief.slice(task.length);
	assert.ok(tail.includes("C"));
	assert.ok(tail.includes(OMISSION_MARKER));
	assert.ok(tail.length - tail.indexOf("C") <= CONTEXT_CAP_CHARS);
	assert.ok(brief.length <= BUDGET_CHARS);
});

test("a short context follows the task whole, behind the label", () => {
	assert.equal(
		buildPrompt("Do it", "Shared notes"),
		"Do it\n\nBatch context:\nShared notes",
	);
});

test("the prompt redacts secrets in the context", () => {
	assert.doesNotMatch(
		buildPrompt("Do it", "set API_KEY=abc123def456 first"),
		/abc123def456/,
	);
});

test("the context shrinks to the budget the task leaves", () => {
	const task = "T".repeat(11000);
	const brief = buildPrompt(task, "C".repeat(5000));
	assert.ok(brief.startsWith(task));
	assert.equal(brief.length, BUDGET_CHARS);
});

test("the context is dropped when under 500 characters remain", () => {
	const task = "T".repeat(11600);
	assert.equal(buildPrompt(task, "C".repeat(5000)), task);
});

test("the context is added when exactly 500 characters remain", () => {
	const task = "T".repeat(11483);
	assert.equal(buildPrompt(task, "C".repeat(5000)).length, BUDGET_CHARS);
});

test("the context is dropped when 499 characters remain", () => {
	const task = "T".repeat(11484);
	assert.equal(buildPrompt(task, "C".repeat(5000)), task);
});

test("the task is never shortened for the context", () => {
	const task = "T".repeat(20000);
	assert.equal(buildPrompt(task, "C".repeat(5000)), prepareBrief(task));
});

test("with no context the prompt is the task alone", () => {
	assert.equal(buildPrompt("Do it", ""), "Do it");
});

test("contextText keeps a non-blank string as it is", () => {
	assert.equal(contextText("  Shared notes\n"), "  Shared notes\n");
});

test("contextText drops a blank string and any value that is not a string", () => {
	for (const value of ["", "  \n\t ", undefined, null, 42, { text: "notes" }])
		assert.equal(contextText(value), "");
});

test("the role cap and the neutral line are fixed", () => {
	assert.equal(ROLE_CAP, 500);
	assert.equal(NO_DESCRIPTION, "An agent with no description.");
});

// The factors were fitted on the calibration cases, so the role must be the one most of them carry.
test("DEFAULT_ROLE is the most common general-purpose role of the calibration cases and fits the role cap", () => {
	const counts = new Map<string, number>();
	for (const line of readFileSync(CALIBRATION, "utf8").split("\n")) {
		if (line.trim() === "") continue;
		const { role } = JSON.parse(line) as { role: string };
		if (role.startsWith("General-purpose agent"))
			counts.set(role, (counts.get(role) ?? 0) + 1);
	}
	const [common] = [...counts].reduce((a, b) => (b[1] > a[1] ? b : a));
	assert.equal(DEFAULT_ROLE, common);
	assert.ok(DEFAULT_ROLE.length <= ROLE_CAP);
});

test("a description of exactly the cap comes back whole, one unit more is cut", () => {
	assert.equal(roleText("x".repeat(ROLE_CAP)), "x".repeat(ROLE_CAP));
	assert.equal(roleText("x".repeat(ROLE_CAP + 1)), "x".repeat(ROLE_CAP));
});

test("whitespace runs collapse to one space and the ends are trimmed", () => {
	assert.equal(
		roleText("  Reviews\n\n code \t changes  "),
		"Reviews code changes",
	);
});

test("a key beyond the cap is masked before the cut", () => {
	const key = "sk-abcdefghijklmnop";
	const out = roleText(`${"x ".repeat(240)}${key}`);
	assert.ok(!out.includes("sk-"));
	assert.ok(out.length <= ROLE_CAP);
	const split = roleText(`${"x".repeat(ROLE_CAP - 5)} ${key}`);
	assert.ok(!split.includes("sk-"));
	assert.ok(split.endsWith("***"));
});

test("a surrogate pair at the boundary is not split", () => {
	const out = roleText(`${"x".repeat(ROLE_CAP - 1)}\u{1F600}`);
	assert.equal(out, "x".repeat(ROLE_CAP - 1));
	const whole = roleText(`${"x".repeat(ROLE_CAP - 2)}\u{1F600}`);
	assert.equal(whole.length, ROLE_CAP);
	assert.ok(whole.endsWith("\u{1F600}"));
});

test("descriptionText masks, collapses, trims and cuts like the role text, with no neutral line", () => {
	const key = "TOKEN=abc123def456";
	assert.equal(
		descriptionText(`  Fix the deploy,\n\n ${key} in .env  `),
		"Fix the deploy, TOKEN=*** in .env",
	);
	assert.equal(descriptionText("x".repeat(100_000)), "x".repeat(ROLE_CAP));
	for (const input of [undefined, null, 7, {}, "", " \n\t "])
		assert.equal(descriptionText(input), "");
	for (const input of ["a\tb", `${"x".repeat(ROLE_CAP - 1)}\u{1F600}`, key])
		assert.equal(roleText(input), descriptionText(input));
});

test("a non-string, missing or blank description gives the neutral line", () => {
	for (const input of [undefined, null, 7, {}, "", " \n\t "]) {
		assert.equal(roleText(input), NO_DESCRIPTION);
	}
});

// Token-shaped fixtures are joined from pieces at run time, so neither push protection nor the owner-setup scan reads this file as a leak.
const j = (...pieces: string[]) => pieces.join("");
const A36 = "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8";
const AWS_ID = j("AKIA", "IOSFODNN7EXAMPLE");
const AWS_SECRET = j("wJalrXUtnFEMI", "/K7MDENG/bPxRfiCYEXAMPLEKEY");
const RSA = "RSA PRIVATE";
const PEM_BODY =
	"MIIEowIBAAKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOEePzNm0tRgeLezV6ffAt0gun\nVTLw7onLRnrq0/IzW7yWR7QkrmBL7jTKEn5u+qKhbwKfBstIs+bMY2Zkp18gnTxK";
const PEM_BLOCK = `-----BEGIN ${RSA} KEY-----\n${PEM_BODY}\n-----END ${RSA} KEY-----`;
const SK_KEY = j("sk", "-ant-api03-", "abcdefghijklmnop");
const TOKEN = j("abc123", "def456ghi789");

// The entry whose pattern joins TOKEN_PREFIXES. A row tagged with a prefix name belongs to it.
const PREFIX_ENTRY = "token prefixes";
const entryOf = (tag: string) =>
	Object.hasOwn(TOKEN_PREFIXES, tag) ? PREFIX_ENTRY : tag;
const redactWith = (table: readonly Redaction[], text: string) =>
	table.reduce((t, r) => t.replace(r.pattern, r.replacement), text);
const without = (name: string) => REDACTIONS.filter((r) => r.name !== name);

// Each row: the entry or prefix it tests, a name, the input, and what prepareBrief gives.
const SHAPES: [string, string, string, string][] = [
	[
		"PEM private key",
		"a PEM private key block",
		`key:\n${PEM_BLOCK}\ndone`,
		"key:\n***\ndone",
	],
	[
		"PEM private key",
		"a PEM header with no END line",
		`the key starts -----BEGIN ${"OPENSSH PRIVATE"} KEY----- b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQ and more prose after it`,
		"the key starts *** and more prose after it",
	],
	[
		"URL credentials",
		"a password in a database URL",
		`connect to ${j("postgres", "://admin:", "s3cr3t", "@db.internal:5432/app")}`,
		"connect to postgres://***@db.internal:5432/app",
	],
	[
		"URL credentials",
		"a token in an HTTPS URL",
		`clone ${j("https", "://x-access-token:", "abc123def456", "@github.com/o/r.git")}`,
		"clone https://***@github.com/o/r.git",
	],
	[
		"URL credentials",
		"a password that holds @",
		j("postgres", "://admin:", "p@ssw0rd", "@db.example/x"),
		"postgres://***@db.example/x",
	],
	[
		"URL credentials",
		"a scheme with a plus sign",
		j("mongodb+srv", "://app:", "pa55word", "@cluster0.example.net/db"),
		"mongodb+srv://***@cluster0.example.net/db",
	],
	[
		"URL credentials",
		"a user and a password of any length",
		j("https", "://", "a".repeat(300), ":", "P".repeat(257), "@example.com/x"),
		"https://***@example.com/x",
	],
	[
		"Authorization header",
		"Basic credentials up to the quote around the header",
		`curl -H "Authorization: Basic ${j("dXNlcjpw", "YXNzd29yZA==")}" https://api.example.com then report`,
		'curl -H "Authorization: Basic ***" https://api.example.com then report',
	],
	[
		"Authorization header",
		"a JSON value up to its closing quote",
		`{"Authorization": "Basic ${j("abcdefgh", "ijklmnop")}", "next": 1}`,
		'{"Authorization": "Basic ***", "next": 1}',
	],
	[
		"Authorization header",
		"a Digest header in single quotes, through its quoted parameters",
		`curl -H 'Authorization: Digest username="a", response="${j("0123456789", "abcdef0123")}"' https://host`,
		"curl -H 'Authorization: Digest ***' https://host",
	],
	[
		"Authorization header",
		"an escaped quote that does not close the credential",
		`{"h": "Authorization: Basic ${j("abc", '\\"', "def456ghi")}", "x": 1}`,
		'{"h": "Authorization: Basic ***", "x": 1}',
	],
	[
		"Authorization header",
		"a quote that does not close on its line, to the end of the line",
		`"Authorization: Basic ${j("abc123", " def456")}\nnext`,
		'"Authorization: Basic ***\nnext',
	],
	[
		"Authorization header",
		"a Token scheme",
		`Authorization: Token ${TOKEN}`,
		"Authorization: Token ***",
	],
	[
		"Authorization header",
		"every parameter of a Digest scheme",
		`Authorization: Digest username="a", response="${j("0123456789", "abcdef0123")}"`,
		"Authorization: Digest ***",
	],
	[
		"Authorization header",
		"a long value with no scheme",
		`Authorization: ${j("0123456789", "abcdef0123")}`,
		"Authorization: ***",
	],
	[
		"AWS secret",
		"an AWS id and its secret",
		`creds ${AWS_ID} ${AWS_SECRET}`,
		"creds *** ***",
	],
	[
		"AWS secret",
		"an AWS CSV row",
		`Access key ID,Secret access key\n${AWS_ID},${AWS_SECRET}`,
		"Access key ID,Secret access key\n***,***",
	],
	[
		"JSON Web Token",
		"a JSON Web Token",
		`cookie ${j("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", ".", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", ".", "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U")}`,
		"cookie ***",
	],
	[
		"GitHub token",
		"a GitHub classic token",
		`use ${j("ghp", "_", A36)} to push`,
		"use *** to push",
	],
	[
		"GitHub token",
		"a GitHub app token",
		`x-access-token ${j("ghs", "_", A36)}`,
		"x-access-token ***",
	],
	[
		"GitHub fine-grained token",
		"a GitHub fine-grained token",
		`token ${j("github", "_pat_", "11ABCDEFG0123456789abc", "_", "x".repeat(59))}`,
		"token ***",
	],
	[
		"GitLab token",
		"a GitLab token",
		`use ${j("glpat", "-", "xxxxxxxxxxxxxxxxxxxx")}`,
		"use ***",
	],
	[
		"Slack token",
		"a Slack bot token",
		`post with ${j("xoxb", "-", "1234567890123-1234567890123-", "AbCdEfGhIjKlMnOpQrStUvWx")}`,
		"post with ***",
	],
	[
		"Slack app token",
		"a Slack app token",
		`connect with ${j("xapp", "-1-", "A0123456789-0123456789-abcdef")}`,
		"connect with ***",
	],
	[
		"Slack webhook",
		"a Slack services webhook",
		`curl ${j("https://hooks", ".slack.com/services/", "T00000000/B00000000/", "XXXXXXXXXXXXXXXXXXXXXXXX")}`,
		"curl https://***",
	],
	[
		"Slack webhook",
		"a Slack workflows webhook",
		`curl ${j("https://hooks", ".slack.com/workflows/", "T00000000/A00000000/", "XXXXXXXXXXXXXXXXXXXXXXXX")}`,
		"curl https://***",
	],
	[
		"Slack webhook",
		"a Slack triggers webhook",
		`curl ${j("https://hooks", ".slack.com/triggers/", "T00000000/0000000000/", "XXXXXXXXXXXXXXXXXXXXXXXX")}`,
		"curl https://***",
	],
	[
		"AWS access key id",
		"named AWS keys",
		`aws_access_key_id = ${AWS_ID}\naws_secret_access_key = ${AWS_SECRET}`,
		"aws_access_key_id = ***\naws_secret_access_key = ***",
	],
	[
		"AWS access key id",
		"a temporary AWS key id",
		`role ${j("ASIA", "IOSFODNN7EXAMPLE")} assumed`,
		"role *** assumed",
	],
	[
		"Google API key",
		"a Google API key",
		`key ${j("AIza", "SyA-1234567890abcdefghijklmnopqrstu")}`,
		"key ***",
	],
	[
		"Google API key",
		"a longer run after the Google prefix",
		`key ${j("AIza", "b".repeat(40))} end`,
		"key *** end",
	],
	[
		"Stripe key",
		"a Stripe key",
		`charge with ${j("sk", "_live_", "51H8abcdefghijklmnopqrstuv")}`,
		"charge with ***",
	],
	[
		"npm token",
		"a bare npm token",
		`publish with ${j("npm", "_", A36)}`,
		"publish with ***",
	],
	[
		"npm token",
		"a longer run after the npm prefix",
		`publish with ${j("npm", "_", "a".repeat(40))} now`,
		"publish with *** now",
	],
	[
		"Hugging Face token",
		"a Hugging Face token",
		`use ${j("hf", "_", "abcdefghijklmnopqrstuvwxyzABCDEFGH")}`,
		"use ***",
	],
	[
		"Hugging Face token",
		"a longer run after the Hugging Face prefix",
		`use ${j("hf", "_", "a".repeat(40))} now`,
		"use *** now",
	],
	[
		"PyPI token",
		"a PyPI upload token",
		`upload with ${j("pypi", "-AgEIcHlwaS5vcmc", "A".repeat(60))}`,
		"upload with ***",
	],
	[
		"Bearer token",
		"a Bearer token in prose",
		`pass Bearer ${TOKEN} to the API`,
		"pass Bearer *** to the API",
	],
	["sk- key", "an sk- key", `key ${SK_KEY}`, "key ***"],
	[
		"curl user",
		"curl -u credentials",
		"curl -u admin:hunter2 https://api.example.com",
		"curl -u *** https://api.example.com",
	],
	[
		"curl user",
		"credentials attached to -u",
		"curl -uadmin:hunter2pass https://x",
		"curl -u*** https://x",
	],
	[
		"curl user",
		"a group of short flags that ends in u",
		"curl -fsSu admin:hunter2pass https://x",
		"curl -fsSu *** https://x",
	],
	[
		"curl user",
		"--user credentials",
		"curl --user admin:hunter2pass https://x",
		"curl --user *** https://x",
	],
	[
		"curl user",
		"--proxy-user credentials",
		"curl --proxy-user admin:hunter2pass https://x",
		"curl --proxy-user *** https://x",
	],
	[
		"curl user",
		"quoted -u credentials",
		`curl -u "admin:hunter 2" https://x and -u 'root:pa ss' https://y`,
		"curl -u *** https://x and -u *** https://y",
	],
	[
		"password is",
		"the word after password is",
		"log in as admin, the password is hunter2",
		"log in as admin, the password is ***",
	],
	[
		"password is",
		"the word after passphrase was",
		"the passphrase was correcthorse yesterday",
		"the passphrase was *** yesterday",
	],
	[
		"password is",
		"the word after passwd is and a colon",
		"the passwd is: hunter2xyz",
		"the passwd is: ***",
	],
	[
		"secret name",
		"a quoted value assigned to a secret name",
		'export API_KEY="abc def ghi"',
		"export API_KEY=***",
	],
	[
		"secret name",
		"an unclosed quote that ends at its line",
		'API_KEY="secret\nRun the tests\nthen report',
		"API_KEY=***\nRun the tests\nthen report",
	],
	[
		"secret name",
		"a quote closed on a later line, masked on its own line",
		'API_KEY="line1\nline2" tail',
		'API_KEY=***\nline2" tail',
	],
	[
		"password is",
		"an unclosed quote after password is, to the end of its line",
		'the password is "hunter 2\nnext step',
		"the password is ***\nnext step",
	],
];

test("each secret shape is masked and its context kept", async (t) => {
	for (const [, name, input, expected] of SHAPES)
		await t.test(name, () => assert.equal(prepareBrief(input), expected));
});

test("each shape row needs its own entry, and each prefix row matches its prefix", async (t) => {
	for (const [tag, name, input] of SHAPES)
		await t.test(name, () => {
			assert.notEqual(
				redactWith(without(entryOf(tag)), input),
				redactWith(REDACTIONS, input),
			);
			const prefix = TOKEN_PREFIXES[tag];
			if (prefix !== undefined)
				assert.match(input, new RegExp(`(?<![A-Za-z0-9])(?:${prefix})`));
		});
});

test("a URL keeps its scheme and host, a header its scheme, prose after a PEM header stays", () => {
	assert.equal(
		prepareBrief(
			`{"Authorization": "Bearer ${j("abcdefgh", "ijklmnop")}", "next": 1}`,
		),
		'{"Authorization": "Bearer ***", "next": 1}',
	);
	assert.equal(
		prepareBrief(
			"Find files that contain -----BEGIN RSA PRIVATE KEY----- headers and delete them. Then run the tests.",
		),
		"Find files that contain *** headers and delete them. Then run the tests.",
	);
});

test("prose and look-alikes stay as they are", () => {
	for (const text of [
		"Use Basic authentication for the admin API, as the Authorization header docs say.",
		"Authorization: required for all routes",
		"Open https://example.com:8443/path?q=1 and ssh://git@github.com/o/r.git",
		"git push -u origin main",
		"See ```inline``` and ~~~ here",
		"```\nunclosed fence\nrest of the brief",
	])
		assert.equal(prepareBrief(text), text);
});

test("a 40-character SHA alone stays, and an AWS id with a secret on its line is masked", () => {
	const sha = "022c3e1d5f0b8a3c4e6f7a8b9c0d1e2f3a4b5c6d";
	assert.equal(
		prepareBrief(`merge ${sha} into main`),
		`merge ${sha} into main`,
	);
	assert.equal(
		prepareBrief(`id ${AWS_ID} secret ${AWS_SECRET}`),
		"id *** secret ***",
	);
	assert.equal(
		prepareBrief(`id ${AWS_ID}\nnext line ${AWS_SECRET}`),
		`id ***\nnext line ${AWS_SECRET}`,
	);
});

// Each order below keeps a secret from leaking. Swapping the two entries leaks it.
const ORDERS: [string, string, string, RegExp][] = [
	["AWS secret", PREFIX_ENTRY, `creds ${AWS_ID} ${AWS_SECRET}`, /EXAMPLEKEY/],
	["PEM private key", "secret name", `key:\n${PEM_BLOCK}`, /MIIE/],
	["Bearer token", "password is", `the password is Bearer ${TOKEN}`, /def456/],
	["Bearer token", "secret name", `TOKEN: Bearer ${TOKEN}`, /def456/],
];

test("the entries that guard each other run in their order", async (t) => {
	const at = (name: string) => REDACTIONS.findIndex((r) => r.name === name);
	for (const [first, second, input, secret] of ORDERS)
		await t.test(`${first} before ${second}`, () => {
			assert.ok(at(first) >= 0 && at(first) < at(second));
			assert.doesNotMatch(prepareBrief(input), secret);
			const swapped = [...REDACTIONS];
			swapped[at(first)] = REDACTIONS[at(second)] as Redaction;
			swapped[at(second)] = REDACTIONS[at(first)] as Redaction;
			assert.match(redactWith(swapped, input), secret);
		});
});

// Each body repeats the pieces that SECRET_PIECES looks for, so any split leaves a piece in view if masking fails.
const PIECES = "Zq9fK2mTvv";
const LONG_SECRETS = [
	j("ghp", "_", PIECES.repeat(4)),
	j("eyJ", PIECES, ".", "ey", PIECES, ".", PIECES),
	`-----BEGIN ${RSA} KEY-----\n${PIECES.repeat(3)}\n${PIECES.repeat(3)}\n-----END ${RSA} KEY-----`,
	j("postgres", "://admin:", PIECES, "x", PIECES, "@db.internal/app"),
];

test("a token, a JWT, a PEM block or a URL password that straddles a cut never appears", () => {
	for (const secret of LONG_SECRETS)
		for (let shift = 0; shift < SWEEP; shift++) {
			const head = `${"x".repeat(HEAD_CHARS - shift)} ${secret} ${"y".repeat(BUDGET_CHARS)}`;
			assert.doesNotMatch(prepareBrief(head), SECRET_PIECES);
			const tail = `${"y".repeat(BUDGET_CHARS)} ${secret} ${"x".repeat(TAIL_CHARS - shift)}`;
			assert.doesNotMatch(prepareBrief(tail), SECRET_PIECES);
		}
});

test("a tilde fence condenses like a backtick fence", () => {
	assert.equal(
		prepareBrief(
			"Write this:\n~~~ts\nconst a = 1\nconst b = 2\n~~~\nthen test",
		),
		"Write this:\n[an exact block of 2 lines is given verbatim]\nthen test",
	);
});

test("a block closes only at a line that holds a run at least as long as its opener", () => {
	const cases: [string, string][] = [
		[
			"~~~~\nfirst\n~~~\nsecond\n~~~~\nafter",
			"[an exact block of 3 lines is given verbatim]\nafter",
		],
		[
			"```\na\n``` not a closer\nb\n```\nend",
			"[an exact block of 3 lines is given verbatim]\nend",
		],
		[
			"```\na\n    ```\n```\nz",
			"[an exact block of 2 lines is given verbatim]\nz",
		],
		[
			"x\n```\na\n   ``` \t\nz",
			"x\n[an exact block of 1 line is given verbatim]\nz",
		],
		[
			"```\na\nb```\n````\nz",
			"[an exact block of 2 lines is given verbatim]\nz",
		],
	];
	for (const [input, expected] of cases)
		assert.equal(prepareBrief(input), expected, input);
});

test("an opener with no closer leaves the text as it is", () => {
	for (const text of [
		"```\na\n``` x\nb",
		"````\na\n```\nb",
		"```\na\n~~~\nb",
		"before ```\na\nb``` after",
	])
		assert.equal(prepareBrief(text), text);
});

test("the fence note says 0 lines for an empty block, 1 line for one and 2 lines for two", () => {
	assert.equal(
		prepareBrief("Write:\n```\n```\nthen\n~~~\n~~~\nend"),
		"Write:\n[an exact block of 0 lines is given verbatim]\nthen\n[an exact block of 0 lines is given verbatim]\nend",
	);
	assert.equal(
		prepareBrief("Write:\n```json\n{}\n```\nthen test"),
		"Write:\n[an exact block of 1 line is given verbatim]\nthen test",
	);
	assert.equal(
		prepareBrief("Write:\n```\n\n```\nthen"),
		"Write:\n[an exact block of 1 line is given verbatim]\nthen",
	);
	assert.equal(
		prepareBrief("Write:\n```\na\nb\n```\nthen"),
		"Write:\n[an exact block of 2 lines is given verbatim]\nthen",
	);
});

// Each input is repeated to a million characters. A quadratic rule takes minutes on some of them, a linear one milliseconds.
// Each row: the entry or prefix it attacks, or "fences" or "all", a name, and the input.
const ADVERSARIAL_SIZE = 1_000_000;
const ADVERSARIAL_LIMIT_MS = 1000;
const fill = (unit: string) =>
	unit
		.repeat(Math.ceil(ADVERSARIAL_SIZE / unit.length))
		.slice(0, ADVERSARIAL_SIZE);
const ADVERSARIAL: [string, string, () => string][] = [
	["all", "a run", () => fill("a")],
	["all", "dash run", () => fill("-")],
	["all", "space run", () => fill(" ")],
	["all", "newline run", () => fill("\n")],
	[
		"all",
		"calibration texts",
		() =>
			fill(
				readFileSync(CALIBRATION, "utf8")
					.split("\n")
					.filter((line) => line.trim() !== "")
					.map((line) => (JSON.parse(line) as { text: string }).text)
					.join("\n\n"),
			),
	],
	["fences", "backtick run", () => fill("`")],
	["fences", "fence opener with no newline", () => fill("```x")],
	["fences", "unclosed fence openers", () => fill("```x\n")],
	["fences", "tilde opener with no newline", () => fill("~~~x")],
	["fences", "tilde run", () => fill("~")],
	["fences", "fence pairs", () => fill("```ts\nconst a = 1\n```\n")],
	[
		"fences",
		"openers of growing length with no closer",
		() =>
			Array.from({ length: 1400 }, (_, k) => `${"`".repeat(3 + k)}x\n`)
				.join("")
				.slice(0, ADVERSARIAL_SIZE),
	],
	[
		"fences",
		"an opener then shorter near-closers",
		() => `\`\`\`\`\n${fill("```\n")}`,
	],
	[
		"fences",
		"an opener then closers followed by text",
		() => `\`\`\`\n${fill("``` x\n")}`,
	],
	[
		"fences",
		"an opener then closers indented four spaces",
		() => `\`\`\`\n${fill("    ```\n")}`,
	],
	[
		"fences",
		"a tilde opener then shorter near-closers",
		() => `~~~~\n${fill("~~~\n")}`,
	],
	["fences", "repeated openers with no closer", () => fill("````x\n```\n")],
	[
		"fences",
		"fences of falling length",
		() =>
			Array.from({ length: 1400 }, (_, k) => `${"`".repeat(1400 - k)}\n`)
				.join("")
				.slice(0, ADVERSARIAL_SIZE),
	],
	[
		"PEM private key",
		"repeated PEM headers",
		() => fill("-----BEGIN PRIVATE KEY-----"),
	],
	[
		"PEM private key",
		"a PEM header then prose",
		() => `-----BEGIN PRIVATE KEY-----\n${fill("word ")}`,
	],
	[
		"PEM private key",
		"PEM headers and dash runs",
		() => fill("-----BEGIN PRIVATE KEY----- ----"),
	],
	["URL credentials", "URL near misses", () => fill("ab://user:pass ")],
	["URL credentials", "URL colon runs", () => fill("a://a:")],
	[
		"URL credentials",
		"URLs with a long user",
		() => fill(`x://${"u".repeat(250)}:${"p".repeat(250)} `),
	],
	[
		"URL credentials",
		"an at-sign run after a URL user",
		() => `a://a:${fill("@")}`,
	],
	["URL credentials", "repeated URL users and at-signs", () => fill("a://a:@")],
	["URL credentials", "a long user with no colon", () => `a://${fill("u")}`],
	[
		"URL credentials",
		"a long password with no at-sign",
		() => `a://b:${fill("p")}`,
	],
	["URL credentials", "many URL starts in one run", () => fill("a://b:")],
	[
		"Authorization header",
		"repeated Authorization headers",
		() => fill("Authorization: Basic "),
	],
	[
		"Authorization header",
		"short Authorization values",
		() => fill("Authorization: ab "),
	],
	[
		"Authorization header",
		"repeated Digest parameters",
		() => fill('Authorization: Digest a="b", '),
	],
	[
		"Authorization header",
		"quoted headers with no closing quote",
		() => fill('"Authorization: Basic '),
	],
	[
		"Authorization header",
		"quoted schemes with no closing quote",
		() => fill('Authorization: "Basic '),
	],
	[
		"Authorization header",
		"escaped quotes inside a quoted header",
		() => `"Authorization: Basic ${fill('\\"')}`,
	],
	[
		"Authorization header",
		"single-quoted Digest headers",
		() => fill(`'Authorization: Digest a="b", `),
	],
	[
		"Authorization header",
		"values one short of the unschemed length",
		() => fill(`Authorization: ${"a".repeat(15)} `),
	],
	[
		"AWS secret",
		"AWS id near misses",
		() => fill(`${j("AKIA", "A".repeat(16))} `),
	],
	[
		"AWS secret",
		"AWS ids then short base64",
		() => fill(`${j("AKIA", "A".repeat(16))} ${"b".repeat(39)} `),
	],
	["JSON Web Token", "JWT dashes", () => fill("eyJ-")],
	["JSON Web Token", "JWT headers and dots", () => fill("eyJaaaaaaaaaa.")],
	[
		"JSON Web Token",
		"JWT two parts",
		() => fill("eyJaaaaaaaaaa.eyJaaaaaaaaaa "),
	],
	[
		"GitHub token",
		"GitHub near misses",
		() => fill(`${j("ghp", "_")}${"a".repeat(35)} `),
	],
	["GitHub token", "GitHub prefix dashes", () => fill(j("ghp", "_-"))],
	[
		"GitHub fine-grained token",
		"fine-grained near misses",
		() => fill(`${j("github", "_pat_")}${"a".repeat(21)} `),
	],
	[
		"GitLab token",
		"GitLab near misses",
		() => fill(`${j("glpat", "-")}${"a".repeat(19)} `),
	],
	["Slack token", "repeated Slack prefixes", () => fill("xoxb-")],
	["Slack app token", "repeated Slack app prefixes", () => fill("xapp-1-")],
	[
		"Slack webhook",
		"short Slack webhook paths",
		() => fill("hooks.slack.com/services/a "),
	],
	[
		"AWS access key id",
		"temporary AWS id near misses",
		() => fill(`${j("ASIA", "A".repeat(15))} `),
	],
	["Google API key", "Google prefix dashes", () => fill("AIza-")],
	["Stripe key", "repeated Stripe prefixes", () => fill(j("sk", "_live_"))],
	[
		"npm token",
		"npm near misses",
		() => fill(`${j("npm", "_")}${"a".repeat(35)} `),
	],
	[
		"Hugging Face token",
		"Hugging Face near misses",
		() => fill(`${j("hf", "_")}${"a".repeat(33)} `),
	],
	[
		"PyPI token",
		"repeated PyPI prefixes",
		() => fill(j("pypi", "-AgEIcHlwaS5vcmc ")),
	],
	["Bearer token", "repeated Bearer", () => fill("Bearer ")],
	["sk- key", "repeated sk- prefixes", () => fill(j("sk", "-"))],
	["curl user", "curl -u near misses", () => fill("-u ab ")],
	["curl user", "curl -u colons", () => fill("-u a:")],
	["curl user", "a double-quoted -u then colons", () => `-u "${fill(":")}`],
	["curl user", "a single-quoted -u then colons", () => `-u '${fill(":")}`],
	[
		"curl user",
		"a double-quoted -u then repeated a:",
		() => `-u "${fill("a:")}`,
	],
	["curl user", "a short flag run of u", () => `-${fill("u")}`],
	["password is", "repeated password is", () => fill("password is ")],
	[
		"password is",
		"repeated password is and a colon",
		() => fill("password is: "),
	],
	["secret name", "KEY run", () => fill("KEY")],
	["secret name", "KEY assignments", () => fill("KEY=")],
	["secret name", "name near misses", () => fill("a_KEY ")],
	["secret name", "open quotes after a name", () => fill('KEY="')],
	[
		"secret name",
		"open quotes after names, one per line",
		() => fill('KEY="a\n'),
	],
	["secret name", "underscore run", () => fill("_")],
];

test("prepareBrief takes linear time on adversarial inputs of a million characters", async (t) => {
	for (const [, name, build] of ADVERSARIAL) {
		const text = build();
		await t.test(name, () => {
			const start = performance.now();
			prepareBrief(text);
			const elapsed = performance.now() - start;
			assert.ok(elapsed < ADVERSARIAL_LIMIT_MS, `${elapsed.toFixed(0)} ms`);
		});
	}
});

test("every entry and every token prefix has a shape row and an adversarial input", () => {
	const names = [
		...REDACTIONS.map((r) => r.name),
		...Object.keys(TOKEN_PREFIXES),
	];
	for (const tags of [
		SHAPES.map(([tag]) => tag),
		ADVERSARIAL.map(([tag]) => tag),
	]) {
		const covered = new Set([...tags, ...tags.map(entryOf)]);
		assert.deepEqual(
			names.filter((n) => !covered.has(n)),
			[],
		);
	}
});

test("roleText masks a GitHub token in a description", () => {
	assert.equal(
		roleText(`Pushes with ${j("ghp", "_", A36)} to the fork`),
		"Pushes with *** to the fork",
	);
});

test("a name ending in key still masks the word after its colon in prose", () => {
	assert.equal(
		prepareBrief("The primary key: user_id. Hotkey: Ctrl+S"),
		"The primary key: *** Hotkey: ***",
	);
});

test("routingState masks the role, the description, the task and the context", () => {
	assert.deepEqual(
		routingState({
			role: `Plans with ${SK_KEY}`,
			description: `Ship\n with ${SK_KEY}`,
			task: `Run with ${SK_KEY}`,
			context: `Notes ${SK_KEY}`,
		}),
		{
			role: "Plans with ***",
			description: "Ship with ***",
			task: "Run with ***\n\nBatch context:\nNotes ***",
		},
	);
});

test("routingState keeps the fixed roles, and a blank description stays empty", () => {
	for (const role of [DEFAULT_ROLE, NO_DESCRIPTION])
		assert.equal(
			routingState({ role, description: undefined, task: "t" }).role,
			role,
		);
	assert.equal(
		routingState({ role: "", description: " ", task: "t" }).role,
		NO_DESCRIPTION,
	);
	assert.equal(
		routingState({ role: "r", description: " ", task: "t" }).description,
		"",
	);
});

// routingState masks text that roleText or prepareBrief may already have masked, so a second pass must change nothing.
test("masking a masked text again changes nothing", () => {
	for (const [, name, , expected] of SHAPES)
		assert.equal(prepareBrief(expected), expected, name);
	assert.equal(roleText(DEFAULT_ROLE), DEFAULT_ROLE);
});
