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
	ROLE_CAP,
	roleText,
} from "./brief.ts";

const CALIBRATION = new URL("../calibration.jsonl", import.meta.url);

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
	const out = prepareBrief(`a\n\n\n\nb ${code} c`);
	assert.equal(
		out,
		`a\n\nb [an exact block of ${BUDGET_CHARS} lines is given verbatim] c`,
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

const SHAPES: [string, string, string][] = [
	[
		"a GitHub classic token",
		`use ${j("ghp", "_", A36)} to push`,
		"use *** to push",
	],
	[
		"a GitHub fine-grained token",
		`token ${j("github", "_pat_", "11ABCDEFG0123456789abc", "_", "x".repeat(59))}`,
		"token ***",
	],
	[
		"a GitHub app token",
		`x-access-token ${j("ghs", "_", A36)}`,
		"x-access-token ***",
	],
	[
		"an AWS id and its secret",
		`creds ${AWS_ID} ${AWS_SECRET}`,
		"creds *** ***",
	],
	[
		"an AWS CSV row",
		`Access key ID,Secret access key\n${AWS_ID},${AWS_SECRET}`,
		"Access key ID,Secret access key\n***,***",
	],
	[
		"named AWS keys",
		`aws_access_key_id = ${AWS_ID}\naws_secret_access_key = ${AWS_SECRET}`,
		"aws_access_key_id = ***\naws_secret_access_key = ***",
	],
	[
		"a Slack bot token",
		`post with ${j("xoxb", "-", "1234567890123-1234567890123-", "AbCdEfGhIjKlMnOpQrStUvWx")}`,
		"post with ***",
	],
	[
		"a Slack webhook",
		`curl ${j("https://hooks", ".slack.com/services/", "T00000000/B00000000/", "XXXXXXXXXXXXXXXXXXXXXXXX")}`,
		"curl https://***",
	],
	[
		"a JSON Web Token",
		`cookie ${j("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", ".", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", ".", "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U")}`,
		"cookie ***",
	],
	[
		"a Google API key",
		`key ${j("AIza", "SyA-1234567890abcdefghijklmnopqrstu")}`,
		"key ***",
	],
	[
		"a password in a database URL",
		`connect to ${j("postgres", "://admin:", "s3cr3t", "@db.internal:5432/app")}`,
		"connect to postgres://***@db.internal:5432/app",
	],
	[
		"a token in an HTTPS URL",
		`clone ${j("https", "://x-access-token:", "abc123def456", "@github.com/o/r.git")}`,
		"clone https://***@github.com/o/r.git",
	],
	[
		"Basic credentials in an Authorization header",
		`curl -H "Authorization: Basic ${j("dXNlcjpw", "YXNzd29yZA==")}" https://api.example.com`,
		'curl -H "Authorization: Basic ***" https://api.example.com',
	],
	[
		"a PEM private key block",
		`key:\n-----BEGIN ${RSA} KEY-----\n${PEM_BODY}\n-----END ${RSA} KEY-----\ndone`,
		"key:\n***\ndone",
	],
	[
		"a PEM header with no END line",
		`the key starts -----BEGIN ${"OPENSSH PRIVATE"} KEY----- b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQ and more prose after it`,
		"the key starts *** and more prose after it",
	],
	[
		"a Stripe key",
		`charge with ${j("sk", "_live_", "51H8abcdefghijklmnopqrstuv")}`,
		"charge with ***",
	],
	[
		"an npm token in .npmrc",
		`//registry.npmjs.org/:_authToken=${j("npm", "_", A36)}`,
		"//registry.npmjs.org/:_authToken=***",
	],
	[
		"a bare npm token",
		`publish with ${j("npm", "_", A36)}`,
		"publish with ***",
	],
	[
		"a GitLab token",
		`use ${j("glpat", "-", "xxxxxxxxxxxxxxxxxxxx")}`,
		"use ***",
	],
	[
		"a Hugging Face token",
		`use ${j("hf", "_", "abcdefghijklmnopqrstuvwxyzABCDEFGH")}`,
		"use ***",
	],
	[
		"curl -u credentials",
		"curl -u admin:hunter2 https://api.example.com",
		"curl -u *** https://api.example.com",
	],
	[
		"the word after password is",
		"log in as admin, the password is hunter2",
		"log in as admin, the password is ***",
	],
];

test("each secret shape is masked and its context kept", async (t) => {
	for (const [name, input, expected] of SHAPES)
		await t.test(name, () => assert.equal(prepareBrief(input), expected));
});

test("a URL keeps its scheme and host, a header its scheme, prose after a PEM header stays", () => {
	const url = prepareBrief(
		j("mongodb+srv", "://app:", "pa55word", "@cluster0.example.net/db"),
	);
	assert.equal(url, "mongodb+srv://***@cluster0.example.net/db");
	assert.equal(
		prepareBrief(`Authorization: Token ${j("abc123", "def456ghi")}`),
		"Authorization: Token ***",
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

test("the fence note says 1 line for one line and 2 lines for two", () => {
	assert.equal(
		prepareBrief("Write:\n```json\n{}\n```\nthen test"),
		"Write:\n[an exact block of 1 line is given verbatim]\nthen test",
	);
	assert.equal(
		prepareBrief("Write:\n```\na\nb\n```\nthen"),
		"Write:\n[an exact block of 2 lines is given verbatim]\nthen",
	);
});

// Each input is repeated to a million characters. A quadratic rule takes minutes on some of them, a linear one milliseconds.
const ADVERSARIAL_SIZE = 1_000_000;
const ADVERSARIAL_LIMIT_MS = 1000;
const fill = (unit: string) =>
	unit
		.repeat(Math.ceil(ADVERSARIAL_SIZE / unit.length))
		.slice(0, ADVERSARIAL_SIZE);
const ADVERSARIAL: Record<string, () => string> = {
	"a run": () => fill("a"),
	"dash run": () => fill("-"),
	"space run": () => fill(" "),
	"newline run": () => fill("\n"),
	"backtick run": () => fill("`"),
	"fence opener with no newline": () => fill("```x"),
	"unclosed fence openers": () => fill("```x\n"),
	"tilde opener with no newline": () => fill("~~~x"),
	"tilde run": () => fill("~"),
	"fence pairs": () => fill("```ts\nconst a = 1\n```\n"),
	"fences of falling length": () =>
		Array.from({ length: 1400 }, (_, k) => `${"`".repeat(1400 - k)}\n`)
			.join("")
			.slice(0, ADVERSARIAL_SIZE),
	"repeated PEM headers": () => fill("-----BEGIN PRIVATE KEY-----"),
	"a PEM header then prose": () =>
		`-----BEGIN PRIVATE KEY-----\n${fill("word ")}`,
	"PEM headers and dash runs": () => fill("-----BEGIN PRIVATE KEY----- ----"),
	"URL near misses": () => fill("ab://user:pass "),
	"URL colon runs": () => fill("a://a:"),
	"URLs with a long user": () =>
		fill(`x://${"u".repeat(250)}:${"p".repeat(250)} `),
	"repeated Authorization headers": () => fill("Authorization: Basic "),
	"short Authorization values": () => fill("Authorization: ab "),
	"AWS id near misses": () => fill(`${j("AKIA", "A".repeat(16))} `),
	"AWS ids then short base64": () =>
		fill(`${j("AKIA", "A".repeat(16))} ${"b".repeat(39)} `),
	"JWT dashes": () => fill("eyJ-"),
	"JWT headers and dots": () => fill("eyJaaaaaaaaaa."),
	"JWT two parts": () => fill("eyJaaaaaaaaaa.eyJaaaaaaaaaa "),
	"GitHub near misses": () => fill(`${j("ghp", "_")}${"a".repeat(35)} `),
	"GitHub prefix dashes": () => fill(j("ghp", "_-")),
	"Google prefix dashes": () => fill("AIza-"),
	"repeated Slack prefixes": () => fill("xoxb-"),
	"repeated Bearer": () => fill("Bearer "),
	"repeated sk- prefixes": () => fill(j("sk", "-")),
	"curl -u near misses": () => fill("-u ab "),
	"curl -u colons": () => fill("-u a:"),
	"repeated password is": () => fill("password is "),
	"KEY run": () => fill("KEY"),
	"KEY assignments": () => fill("KEY="),
	"name near misses": () => fill("a_KEY "),
	"open quotes after a name": () => fill('KEY="'),
	"underscore run": () => fill("_"),
	"calibration texts": () =>
		fill(
			readFileSync(CALIBRATION, "utf8")
				.split("\n")
				.filter((line) => line.trim() !== "")
				.map((line) => (JSON.parse(line) as { text: string }).text)
				.join("\n\n"),
		),
};

test("prepareBrief takes linear time on adversarial inputs of a million characters", () => {
	for (const [name, build] of Object.entries(ADVERSARIAL)) {
		const text = build();
		const start = performance.now();
		prepareBrief(text);
		const elapsed = performance.now() - start;
		assert.ok(
			elapsed < ADVERSARIAL_LIMIT_MS,
			`${name}: ${elapsed.toFixed(0)} ms`,
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
