export type Tier = 0 | 1 | 2;

// What a headless run proves about routing. A field the client does not show is null.
export type Evidence = {
	spawns: number;
	routed: boolean;
	line: string | null;
	tier: Tier | null;
	effort: string | null;
	target: string | null;
	reply: string | null;
};

type Captured = { stdout: string; stderr: string };

// A client joins the runner with one adapter: the headless command and the parser.
export type Adapter = {
	name: string;
	command: (prompt: string, model: string) => string[];
	// Files the command reads from its working directory.
	files?: Record<string, string>;
	parse: (out: Captured) => Evidence;
};
