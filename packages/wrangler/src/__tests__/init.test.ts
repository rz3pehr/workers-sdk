import * as fs from "node:fs";
import path from "node:path";
import * as TOML from "@iarna/toml";
import { execa, execaSync } from "execa";
import { rest } from "msw";
import { parseConfigFileTextToJson } from "typescript";
import { FormData } from "undici";
import { version as wranglerVersion } from "../../package.json";
import { getPackageManager } from "../package-manager";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm, mockSelect } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { PackageManager } from "../package-manager";

/**
 * An expectation matcher for the minimal generated wrangler.toml.
 */
const MINIMAL_WRANGLER_TOML = {
	compatibility_date: expect.any(String),
	name: expect.stringContaining("wrangler-tests"),
	main: "src/index.ts",
};

describe("init", () => {
	let mockPackageManager: PackageManager;
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		setIsTTY(true);

		mockPackageManager = {
			cwd: process.cwd(),
			// @ts-expect-error we're making a fake package manager here
			type: "mockpm",
			addDevDeps: jest.fn(),
			install: jest.fn(),
		};
		(getPackageManager as jest.Mock).mockResolvedValue(mockPackageManager);
	});

	afterEach(() => {
		clearDialogs();
	});

	const std = mockConsoleMethods();

	describe("`wrangler init` is now a deprecated command", () => {
		test("shows deprecation message and delegates to C3", async () => {
			await runWrangler("init");

			checkFiles({
				items: {
					"./src/index.js": false,
					"./src/index.ts": false,
					"./tsconfig.json": false,
					"./package.json": false,
					"./wrangler.toml": false,
				},
			});

			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Running \`mockpm create cloudflare@2\`...",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);

			expect(execa).toHaveBeenCalledWith("mockpm", ["create", "cloudflare@2"], {
				stdio: "inherit",
			});
		});

		it("if `-y` is used, delegate to c3 with --wrangler-defaults", async () => {
			await runWrangler("init -y");

			expect(execa).toHaveBeenCalledWith(
				"mockpm",
				["create", "cloudflare@2", "--", "--wrangler-defaults"],
				{ stdio: "inherit" }
			);
		});
	});

	describe("deprecated behaviour is retained with --no-delegate-c3", () => {
		describe("options", () => {
			it("should initialize with no interactive prompts if `--yes` is used", async () => {
				await runWrangler("init --yes --no-delegate-c3");

				checkFiles({
					items: {
						"./src/index.js": false,
						"./src/index.ts": true,
						"./tsconfig.json": true,
						"./package.json": true,
						"./wrangler.toml": true,
					},
				});

				expect(std.out).toMatchInlineSnapshot(`
			"✨ Created wrangler.toml
			✨ Initialized git repository
			✨ Created package.json
			✨ Created tsconfig.json
			✨ Created src/index.ts
			✨ Created src/index.test.ts
			✨ Installed @cloudflare/workers-types, typescript, and vitest into devDependencies

			To start developing your Worker, run \`npm start\`
			To start testing your Worker, run \`npm test\`
			To publish your Worker to the Internet, run \`npm run deploy\`"
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2 -- --wrangler-defaults\` instead.[0m

			  The \`init\` command will be removed in a future version.

			"
		`);
			});

			it("should initialize with no interactive prompts if `--yes` is used (named worker)", async () => {
				await runWrangler("init my-worker --yes --no-delegate-c3");

				checkFiles({
					items: {
						"./my-worker/src/index.js": false,
						"./my-worker/src/index.ts": true,
						"./my-worker/tsconfig.json": true,
						"./my-worker/package.json": true,
						"./my-worker/wrangler.toml": wranglerToml({
							...MINIMAL_WRANGLER_TOML,
							name: "my-worker",
						}),
					},
				});

				expect(std.out).toMatchInlineSnapshot(`
			"✨ Created my-worker/wrangler.toml
			✨ Initialized git repository at my-worker
			✨ Created my-worker/package.json
			✨ Created my-worker/tsconfig.json
			✨ Created my-worker/src/index.ts
			✨ Created my-worker/src/index.test.ts
			✨ Installed @cloudflare/workers-types, typescript, and vitest into devDependencies

			To start developing your Worker, run \`cd my-worker && npm start\`
			To start testing your Worker, run \`npm test\`
			To publish your Worker to the Internet, run \`npm run deploy\`"
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2 -- --wrangler-defaults\` instead.[0m

			  The \`init\` command will be removed in a future version.

			"
		`);
			});

			it("should initialize with no interactive prompts if `-y` is used", async () => {
				await runWrangler("init -y --no-delegate-c3");

				checkFiles({
					items: {
						"./src/index.js": false,
						"./src/index.ts": true,
						"./tsconfig.json": true,
						"./package.json": true,
						"./wrangler.toml": true,
					},
				});

				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "Your project will use Vitest to run your tests.",
			  "out": "✨ Created wrangler.toml
			✨ Initialized git repository
			✨ Created package.json
			✨ Created tsconfig.json
			✨ Created src/index.ts
			✨ Created src/index.test.ts
			✨ Installed @cloudflare/workers-types, typescript, and vitest into devDependencies

			To start developing your Worker, run \`npm start\`
			To start testing your Worker, run \`npm test\`
			To publish your Worker to the Internet, run \`npm run deploy\`",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2 -- --wrangler-defaults\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should error if `--type javascript` is used", async () => {
				await expect(
					runWrangler("init --type javascript")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`"The --type option is no longer supported."`
				);
			});

			it("should error if `--type rust` is used", async () => {
				await expect(
					runWrangler("init --type rust")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`"The --type option is no longer supported."`
				);
			});

			it("should error if `--type webpack` is used", async () => {
				await expect(runWrangler("init --type webpack")).rejects
					.toThrowErrorMatchingInlineSnapshot(`
              "The --type option is no longer supported.
              If you wish to use webpack then you will need to create a custom build."
            `);
			});

			it("should error if `--site` is used", async () => {
				await expect(runWrangler("init --site")).rejects
					.toThrowErrorMatchingInlineSnapshot(`
              "The --site option is no longer supported.
              If you wish to create a brand new Worker Sites project then clone the \`worker-sites-template\` starter repository:

              \`\`\`
              git clone --depth=1 --branch=wrangler2 https://github.com/cloudflare/worker-sites-template my-site
              cd my-site
              \`\`\`

              Find out more about how to create and maintain Sites projects at https://developers.cloudflare.com/workers/platform/sites.
              Have you considered using Cloudflare Pages instead? See https://pages.cloudflare.com/."
            `);
			});
		});

		describe("wrangler.toml", () => {
			it("should create a wrangler.toml", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: false,
					}
				);
				await runWrangler("init --no-delegate-c3");
				checkFiles({
					items: {
						"wrangler.toml": wranglerToml({
							compatibility_date: expect.any(String),
							name: expect.stringContaining("wrangler-tests"),
						}),
						"package.json": false,
						"tsconfig.json": false,
					},
				});

				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created wrangler.toml",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should create a wrangler.toml and a directory for a named Worker ", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: false,
					}
				);
				await runWrangler("init my-worker --no-delegate-c3");

				checkFiles({
					items: {
						"my-worker/wrangler.toml": wranglerToml({
							compatibility_date: expect.any(String),
							name: "my-worker",
						}),
						"my-worker/package.json": false,
						"my-worker/tsconfig.json": false,
					},
				});

				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created my-worker/wrangler.toml",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should display warning when wrangler.toml already exists, and exit if user does not want to carry on", async () => {
				writeFiles({
					items: {
						"wrangler.toml": wranglerToml({
							// use a fake value to make sure the file is not overwritten
							compatibility_date: "something-else",
						}),
					},
				});

				mockConfirm({
					text: "Do you want to continue initializing this project?",
					result: false,
				});

				await runWrangler("init --no-delegate-c3");
				expect(std.warn).toContain("wrangler.toml already exists!");

				checkFiles({
					items: {
						"wrangler.toml": wranglerToml({
							compatibility_date: "something-else",
						}),
						"package.json": false,
						"tsconfig.json": false,
					},
				});

				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mwrangler.toml already exists![0m

			",
			}
		`);
			});

			it("should display warning when wrangler.toml already exists in the target directory, and exit if user does not want to carry on", async () => {
				writeFiles({
					items: {
						"path/to/worker/wrangler.toml": wranglerToml({
							compatibility_date: "something-else",
						}),
					},
				});
				mockConfirm({
					text: "Do you want to continue initializing this project?",
					result: false,
				});

				await runWrangler("init path/to/worker --no-delegate-c3");

				expect(std.warn).toContain("wrangler.toml already exists!");
				checkFiles({
					items: {
						"path/to/worker/wrangler.toml": wranglerToml({
							compatibility_date: "something-else",
						}),
						"package.json": false,
						"tsconfig.json": false,
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mpath/to/worker/wrangler.toml already exists![0m

			",
			}
		`);
			});

			it("should not overwrite an existing wrangler.toml, after agreeing to other prompts", async () => {
				writeFiles({
					items: {
						"wrangler.toml": wranglerToml({
							compatibility_date: "something-else",
						}),
					},
				});
				mockConfirm(
					{
						text: "Do you want to continue initializing this project?",
						result: true,
					},
					{
						text: "Would you like to use git to manage this Worker?",
						result: true,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: true,
					}
				);

				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.ts"
					)}?`,
					result: "fetch",
				});
				mockConfirm({
					text: "Would you like us to write your first test with Vitest?",
					result: true,
				});

				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"wrangler.toml": wranglerToml({
							compatibility_date: "something-else",
						}),
					},
				});
			});

			it("should display warning when wrangler.toml already exists, but continue if user does want to carry on", async () => {
				writeFiles({
					items: {
						"wrangler.toml": wranglerToml({
							compatibility_date: "something-else",
						}),
					},
				});
				mockConfirm(
					{
						text: "Do you want to continue initializing this project?",
						result: true,
					},
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: false,
					}
				);

				await runWrangler("init --no-delegate-c3");

				expect(std.warn).toContain("wrangler.toml already exists!");
				checkFiles({
					items: {
						"wrangler.toml": wranglerToml({
							compatibility_date: "something-else",
						}),
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mwrangler.toml already exists![0m

			",
			}
		`);
			});

			it("should not add a Cron Trigger to wrangler.toml when creating a Scheduled Worker if wrangler.toml already exists", async () => {
				writeFiles({
					items: {
						"wrangler.toml": wranglerToml({
							compatibility_date: "something-else",
						}),
					},
				});
				mockConfirm(
					{
						text: "Do you want to continue initializing this project?",
						result: true,
					},
					{
						text: "Would you like to use git to manage this Worker?",
						result: true,
					},

					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: true,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.ts"
					)}?`,
					result: "scheduled",
				});

				mockConfirm({
					text: "Would you like us to write your first test with Vitest?",
					result: true,
				});
				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"wrangler.toml": wranglerToml({
							compatibility_date: "something-else",
						}),
					},
				});
			});

			it("should add a Cron Trigger to wrangler.toml when creating a Scheduled Worker, but only if wrangler.toml is being created during init", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: true,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: true,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.ts"
					)}?`,
					result: "scheduled",
				});
				mockConfirm({
					text: "Would you like us to write your first test with Vitest?",
					result: true,
				});
				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"wrangler.toml": wranglerToml({
							...MINIMAL_WRANGLER_TOML,
							triggers: { crons: ["1 * * * *"] },
						}),
					},
				});
			});
		});

		describe("git init", () => {
			it("should offer to initialize a git repository", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: true,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: false,
					}
				);

				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"wrangler.toml": wranglerToml({
							compatibility_date: expect.any(String),
							name: expect.stringContaining("wrangler-tests"),
						}),
						".git": { items: {} },
						".gitignore": true,
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created wrangler.toml
			✨ Initialized git repository",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
				expect(
					(await execa("git", ["branch", "--show-current"])).stdout
				).toEqual(getDefaultBranchName());
			});

			it("should not offer to initialize a git repo if it's already inside one", async () => {
				await execa("git", ["init"]);
				setWorkingDirectory("some-folder");

				await runWrangler("init -y --no-delegate-c3");

				checkFiles({
					items: {
						"wrangler.toml": wranglerToml({
							...MINIMAL_WRANGLER_TOML,
							name: "some-folder",
						}),
						".git": { items: {} },
						".gitignore": false,
					},
				});

				// Note the lack of "✨ Initialized git repository" in the log
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "Your project will use Vitest to run your tests.",
			  "out": "✨ Created wrangler.toml
			✨ Created package.json
			✨ Created tsconfig.json
			✨ Created src/index.ts
			✨ Created src/index.test.ts
			✨ Installed @cloudflare/workers-types, typescript, and vitest into devDependencies

			To start developing your Worker, run \`npm start\`
			To start testing your Worker, run \`npm test\`
			To publish your Worker to the Internet, run \`npm run deploy\`",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2 -- --wrangler-defaults\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should not offer to initialize a git repo if it's already inside one (when using a path as name)", async () => {
				fs.mkdirSync("path/to/worker", { recursive: true });
				await execa("git", ["init"], { cwd: "path/to/worker" });
				expect(fs.lstatSync("path/to/worker/.git").isDirectory()).toBe(true);

				await runWrangler("init path/to/worker/my-worker -y --no-delegate-c3");

				// Note the lack of "✨ Initialized git repository" in the log
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "Your project will use Vitest to run your tests.",
			  "out": "✨ Created path/to/worker/my-worker/wrangler.toml
			✨ Created path/to/worker/my-worker/package.json
			✨ Created path/to/worker/my-worker/tsconfig.json
			✨ Created path/to/worker/my-worker/src/index.ts
			✨ Created path/to/worker/my-worker/src/index.test.ts
			✨ Installed @cloudflare/workers-types, typescript, and vitest into devDependencies

			To start developing your Worker, run \`cd path/to/worker/my-worker && npm start\`
			To start testing your Worker, run \`npm test\`
			To publish your Worker to the Internet, run \`npm run deploy\`",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2 -- --wrangler-defaults\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			// I... don't know how to test this lol
			it.todo(
				"should not offer to initialize a git repo if git is not installed"
			);

			it("should initialize git repo with the user's default branch", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: true,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: false,
					}
				);
				await runWrangler("init --no-delegate-c3");
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created wrangler.toml
			✨ Initialized git repository",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);

				expect(execaSync("git", ["symbolic-ref", "HEAD"]).stdout).toEqual(
					`refs/heads/${getDefaultBranchName()}`
				);
			});
		});

		describe("package.json", () => {
			it("should create a package.json if none is found and user confirms", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: false,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.js"
					)}?`,
					result: "none",
				});

				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"package.json": {
							contents: expect.objectContaining({
								name: expect.stringContaining("wrangler-tests"),
								version: "0.0.0",
								devDependencies: {
									wrangler: expect.any(String),
								},
							}),
						},
						"tsconfig.json": false,
					},
				});
				expect(mockPackageManager.install).toHaveBeenCalled();
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created wrangler.toml
			✨ Created package.json",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should create a package.json, with the specified name, if none is found and user confirms", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: false,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"my-worker",
						"src",
						"index.js"
					)}?`,
					result: "none",
				});

				await runWrangler("init my-worker --no-delegate-c3");

				checkFiles({
					items: {
						"my-worker/package.json": {
							contents: expect.objectContaining({
								name: "my-worker",
								version: "0.0.0",
								devDependencies: {
									wrangler: expect.any(String),
								},
							}),
						},
						"my-worker/tsconfig.json": false,
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created my-worker/wrangler.toml
			✨ Created my-worker/package.json",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should not touch an existing package.json in the same directory", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "Would you like to install wrangler into package.json?",
						result: false,
					},
					{
						text: "Would you like to use TypeScript?",
						result: false,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.js"
					)}?`,
					result: "none",
				});
				writeFiles({
					items: {
						"package.json": { contents: { name: "test", version: "1.0.0" } },
					},
				});

				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"package.json": { contents: { name: "test", version: "1.0.0" } },
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created wrangler.toml",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should not touch an existing package.json in an ancestor directory, when a name is passed", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: false,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"path",
						"to",
						"worker",
						"my-worker",
						"src",
						"index.js"
					)}?`,
					result: "none",
				});
				writeFiles({
					items: {
						"path/to/worker/package.json": {
							contents: { name: "test", version: "1.0.0" },
						},
					},
				});

				await runWrangler("init path/to/worker/my-worker --no-delegate-c3");

				checkFiles({
					items: {
						"path/to/worker/package.json": {
							contents: { name: "test", version: "1.0.0" },
						},
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created path/to/worker/my-worker/wrangler.toml
			✨ Created path/to/worker/my-worker/package.json",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should offer to install wrangler into an existing package.json", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "Would you like to install wrangler into package.json?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: false,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.js"
					)}?`,
					result: "none",
				});
				writeFiles({
					items: {
						"package.json": {
							contents: { name: "test", version: "1.0.0" },
						},
					},
				});

				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"package.json": {
							contents: { name: "test", version: "1.0.0" },
						},
					},
				});
				expect(mockPackageManager.addDevDeps).toHaveBeenCalledWith(
					`wrangler@${wranglerVersion}`
				);
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created wrangler.toml
			✨ Installed wrangler into devDependencies",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should offer to install wrangler into a package.json relative to the target directory, if no name is provided", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: `Would you like to install wrangler into ${path.join(
							"..",
							"package.json"
						)}?`,
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: false,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.js"
					)}?`,
					result: "none",
				});
				writeFiles({
					items: {
						"path/to/worker/package.json": {
							contents: { name: "test", version: "1.0.0" },
						},
					},
				});
				setWorkingDirectory("path/to/worker/my-worker");

				await runWrangler("init --no-delegate-c3");

				setWorkingDirectory("../../../..");
				checkFiles({
					items: {
						"path/to/worker/package.json": {
							contents: { name: "test", version: "1.0.0" },
						},
						"path/to/worker/my-worker/package.json": false,
					},
				});
				expect(mockPackageManager.addDevDeps).toHaveBeenCalledWith(
					`wrangler@${wranglerVersion}`
				);
				expect(mockPackageManager.cwd).toBe(process.cwd());
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created wrangler.toml
			✨ Installed wrangler into devDependencies",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should not touch an existing package.json in an ancestor directory", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: `Would you like to install wrangler into ${path.join(
							"..",
							"..",
							"package.json"
						)}?`,
						result: false,
					},
					{
						text: "Would you like to use TypeScript?",
						result: false,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.js"
					)}?`,
					result: "none",
				});
				writeFiles({
					items: {
						"package.json": {
							contents: { name: "test", version: "1.0.0" },
						},
					},
				});
				setWorkingDirectory("./sub-1/sub-2");

				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"package.json": false,
						"../../package.json": {
							contents: { name: "test", version: "1.0.0" },
						},
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created wrangler.toml",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});
		});

		describe("typescript", () => {
			it("should offer to create a worker in a non-typescript project", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "Would you like to install wrangler into package.json?",
						result: false,
					},
					{
						text: "Would you like to use TypeScript?",
						result: false,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.js"
					)}?`,
					result: "fetch",
				});
				mockConfirm({
					text: "Would you like us to write your first test?",
					result: false,
				});
				writeFiles({
					items: {
						"package.json": {
							contents: { name: "test", version: "1.0.0" },
						},
					},
				});

				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"wrangler.toml": wranglerToml({
							...MINIMAL_WRANGLER_TOML,
							main: "src/index.js",
						}),
						"src/index.js": true,
						"src/index.ts": false,
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created wrangler.toml
			✨ Created src/index.js

			To start developing your Worker, run \`npx wrangler dev\`
			To publish your Worker to the Internet, run \`npx wrangler deploy\`",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should offer to create a worker in a typescript project", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "Would you like to install wrangler into package.json?",
						result: false,
					},
					{
						text: "Would you like to use TypeScript?",
						result: true,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.ts"
					)}?`,
					result: "fetch",
				});
				mockConfirm({
					text: "Would you like us to write your first test with Vitest?",
					result: true,
				});
				writeFiles({
					items: {
						"package.json": {
							contents: { name: "test", version: "1.0.0" },
						},
					},
				});

				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"src/index.js": false,
						"src/index.ts": true,
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created wrangler.toml
			✨ Created tsconfig.json
			✨ Created src/index.ts
			✨ Created src/index.test.ts
			✨ Installed @cloudflare/workers-types, typescript, and vitest into devDependencies

			To start developing your Worker, run \`npx wrangler dev\`
			To publish your Worker to the Internet, run \`npx wrangler deploy\`",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should add scripts for a typescript project with .ts extension", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},

					{
						text: "Would you like to use TypeScript?",
						result: true,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.ts"
					)}?`,
					result: "fetch",
				});
				mockConfirm({
					text: "Would you like us to write your first test with Vitest?",
					result: true,
				});

				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"package.json": {
							contents: expect.objectContaining({
								name: expect.stringContaining("wrangler-tests"),
								version: "0.0.0",
								scripts: {
									deploy: "wrangler deploy",
									start: "wrangler dev",
									test: "vitest",
								},
								devDependencies: {
									wrangler: expect.any(String),
								},
							}),
						},
						"src/index.js": false,
						"src/index.ts": true,
					},
				});
				expect(std.out).toMatchInlineSnapshot(`
			"✨ Created wrangler.toml
			✨ Created package.json
			✨ Created tsconfig.json
			✨ Created src/index.ts
			✨ Created src/index.test.ts
			✨ Installed @cloudflare/workers-types, typescript, and vitest into devDependencies

			To start developing your Worker, run \`npm start\`
			To start testing your Worker, run \`npm test\`
			To publish your Worker to the Internet, run \`npm run deploy\`"
		`);
			});

			it("should not overwrite package.json scripts for a typescript project", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "Would you like to install wrangler into package.json?",
						result: false,
					},
					{
						text: "Would you like to use TypeScript?",
						result: true,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.ts"
					)}?`,
					result: "fetch",
				});
				mockConfirm({
					text: "Would you like us to write your first test with Vitest?",
					result: true,
				});
				writeFiles({
					items: {
						"package.json": {
							contents: {
								scripts: {
									start: "test-start",
									deploy: "test-deploy",
								},
							},
						},
					},
				});

				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"package.json": {
							contents: {
								scripts: {
									start: "test-start",
									deploy: "test-deploy",
								},
							},
						},
						"src/index.js": false,
						"src/index.ts": true,
					},
				});
				expect(std.out).toMatchInlineSnapshot(`
			"✨ Created wrangler.toml
			✨ Created tsconfig.json
			✨ Created src/index.ts
			✨ Created src/index.test.ts
			✨ Installed @cloudflare/workers-types, typescript, and vitest into devDependencies

			To start developing your Worker, run \`npx wrangler dev\`
			To publish your Worker to the Internet, run \`npx wrangler deploy\`"
		`);
			});

			it("should not offer to create a worker in a ts project if a file already exists at the location", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "Would you like to install wrangler into package.json?",
						result: false,
					},
					{
						text: "Would you like to use TypeScript?",
						result: true,
					}
				);
				const PLACEHOLDER = "/* placeholder text */";
				writeFiles({
					items: {
						"package.json": { contents: { name: "test", version: "1.0.0" } },
						"src/index.ts": { contents: PLACEHOLDER },
					},
				});

				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"src/index.js": false,
						"src/index.ts": { contents: PLACEHOLDER },
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created wrangler.toml
			✨ Created tsconfig.json
			✨ Installed @cloudflare/workers-types and typescript into devDependencies",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should not offer to create a worker in a ts project for a named worker if a file already exists at the location", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},

					{
						text: "Would you like to use TypeScript?",
						result: true,
					}
				);
				const PLACEHOLDER = "/* placeholder text */";
				writeFiles({
					items: {
						"package.json": { contents: { name: "test", version: "1.0.0" } },
						"my-worker/src/index.ts": { contents: PLACEHOLDER },
					},
				});

				await runWrangler("init my-worker --no-delegate-c3");

				checkFiles({
					items: {
						"my-worker/src/index.js": false,
						"my-worker/src/index.ts": { contents: PLACEHOLDER },
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created my-worker/wrangler.toml
			✨ Created my-worker/package.json
			✨ Created my-worker/tsconfig.json
			✨ Installed @cloudflare/workers-types and typescript into devDependencies",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should create a tsconfig.json and install `workers-types` if none is found and user confirms", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: true,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.ts"
					)}?`,
					result: "none",
				});

				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"tsconfig.json": {
							contents: {
								config: {
									compilerOptions: expect.objectContaining({
										types: ["@cloudflare/workers-types"],
									}),
								},
								error: undefined,
							},
						},
					},
				});
				expect(mockPackageManager.addDevDeps).toHaveBeenCalledWith(
					"@cloudflare/workers-types",
					"typescript"
				);
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created wrangler.toml
			✨ Created package.json
			✨ Created tsconfig.json
			✨ Installed @cloudflare/workers-types and typescript into devDependencies",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should not touch an existing tsconfig.json in the same directory", async () => {
				mockConfirm({
					text: "Would you like to use git to manage this Worker?",
					result: false,
				});
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.ts"
					)}?`,
					result: "fetch",
				});
				mockConfirm({
					text: "Would you like us to write your first test with Vitest?",
					result: true,
				});
				writeFiles({
					items: {
						"package.json": {
							contents: {
								name: "test",
								version: "1.0.0",
								devDependencies: {
									wrangler: "0.0.0",
									"@cloudflare/workers-types": "0.0.0",
								},
							},
						},
						"tsconfig.json": { contents: { compilerOptions: {} } },
					},
				});

				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"tsconfig.json": {
							contents: { config: { compilerOptions: {} }, error: undefined },
						},
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created wrangler.toml
			✨ Created src/index.ts
			✨ Created src/index.test.ts
			✨ Installed vitest into devDependencies

			To start developing your Worker, run \`npx wrangler dev\`
			To publish your Worker to the Internet, run \`npx wrangler deploy\`",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should not touch an existing tsconfig.json in the ancestor of a target directory, if a name is passed", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: true,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"path",
						"to",
						"worker",
						"my-worker",
						"src",
						"index.ts"
					)}?`,
					result: "fetch",
				});
				mockConfirm({
					text: "Would you like us to write your first test with Vitest?",
					result: true,
				});
				writeFiles({
					items: {
						"path/to/worker/package.json": {
							contents: {
								name: "test",
								version: "1.0.0",
								devDependencies: {
									wrangler: "0.0.0",
									"@cloudflare/workers-types": "0.0.0",
								},
							},
						},
						"path/to/worker/tsconfig.json": {
							contents: { compilerOptions: {} },
						},
					},
				});

				await runWrangler("init path/to/worker/my-worker --no-delegate-c3");

				checkFiles({
					items: {
						"path/to/worker/tsconfig.json": {
							contents: { config: { compilerOptions: {}, error: undefined } },
						},
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created path/to/worker/my-worker/wrangler.toml
			✨ Created path/to/worker/my-worker/package.json
			✨ Created path/to/worker/my-worker/tsconfig.json
			✨ Created path/to/worker/my-worker/src/index.ts
			✨ Created path/to/worker/my-worker/src/index.test.ts
			✨ Installed @cloudflare/workers-types, typescript, and vitest into devDependencies

			To start developing your Worker, run \`cd path/to/worker/my-worker && npm start\`
			To start testing your Worker, run \`npm test\`
			To publish your Worker to the Internet, run \`npm run deploy\`",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should offer to install type definitions in an existing typescript project", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "Would you like to install wrangler into package.json?",
						result: false,
					},
					{
						text: "Would you like to install the type definitions for Workers into your package.json?",
						result: true,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.ts"
					)}?`,
					result: "none",
				});
				writeFiles({
					items: {
						"./package.json": {
							contents: {
								name: "test",
								version: "1.0.0",
							},
						},
						"./tsconfig.json": { contents: { compilerOptions: {} } },
					},
				});

				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						// unchanged tsconfig
						"tsconfig.json": { contents: { config: { compilerOptions: {} } } },
					},
				});
				expect(mockPackageManager.addDevDeps).toHaveBeenCalledWith(
					"@cloudflare/workers-types"
				);
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created wrangler.toml
			✨ Installed @cloudflare/workers-types into devDependencies
			🚨 Please add \\"@cloudflare/workers-types\\" to compilerOptions.types in tsconfig.json",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should not touch an existing tsconfig.json in an ancestor directory", async () => {
				mockConfirm({
					text: "Would you like to use git to manage this Worker?",
					result: false,
				});
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.ts"
					)}?`,
					result: "fetch",
				});
				mockConfirm({
					text: "Would you like us to write your first test with Vitest?",
					result: true,
				});
				writeFiles({
					items: {
						"package.json": {
							contents: {
								name: "test",
								version: "1.0.0",
								devDependencies: {
									wrangler: "0.0.0",
									"@cloudflare/workers-types": "0.0.0",
								},
							},
						},
						"tsconfig.json": { contents: { compilerOptions: {} } },
					},
				});
				setWorkingDirectory("./sub-1/sub-2");

				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"tsconfig.json": false,
						"../../tsconfig.json": {
							contents: { config: { compilerOptions: {} } },
						},
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created wrangler.toml
			✨ Created src/index.ts
			✨ Created src/index.test.ts
			✨ Installed vitest into devDependencies

			To start developing your Worker, run \`npx wrangler dev\`
			To publish your Worker to the Internet, run \`npx wrangler deploy\`",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});
		});

		describe("javascript", () => {
			it("should add missing scripts for a non-ts project with .js extension", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},

					{
						text: "Would you like to use TypeScript?",
						result: false,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.js"
					)}?`,
					result: "fetch",
				});
				mockConfirm({
					text: "Would you like us to write your first test?",
					result: false,
				});
				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"src/index.js": true,
						"src/index.ts": false,
						"package.json": {
							contents: expect.objectContaining({
								name: expect.stringContaining("wrangler-tests"),
								version: "0.0.0",
								scripts: {
									start: "wrangler dev",
									deploy: "wrangler deploy",
								},
							}),
						},
					},
				});
				expect(std.out).toMatchInlineSnapshot(`
			        "✨ Created wrangler.toml
			        ✨ Created package.json
			        ✨ Created src/index.js

			        To start developing your Worker, run \`npm start\`
			        To publish your Worker to the Internet, run \`npm run deploy\`"
		      `);
			});
			it("should add a jest test for a non-ts project with .js extension", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: false,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.js"
					)}?`,
					result: "fetch",
				});
				mockConfirm({
					text: "Would you like us to write your first test?",
					result: true,
				});
				mockSelect({
					text: "Which test runner would you like to use?",
					result: "jest",
				});
				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"src/index.js": true,
						"src/index.test.js": true,
						"src/index.ts": false,
						"package.json": {
							contents: expect.objectContaining({
								name: expect.stringContaining("wrangler-tests"),
								version: "0.0.0",
								scripts: {
									start: "wrangler dev",
									deploy: "wrangler deploy",
									test: "jest",
								},
							}),
						},
					},
				});
				expect(std.out).toMatchInlineSnapshot(`
			"✨ Created wrangler.toml
			✨ Created package.json
			✨ Created src/index.js
			✨ Created src/index.test.js
			✨ Installed jest into devDependencies

			To start developing your Worker, run \`npm start\`
			To start testing your Worker, run \`npm test\`
			To publish your Worker to the Internet, run \`npm run deploy\`"
		`);
			});

			it("should add a vitest test for a non-ts project with .js extension", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: false,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.js"
					)}?`,
					result: "fetch",
				});
				mockConfirm({
					text: "Would you like us to write your first test?",
					result: true,
				});
				mockSelect({
					text: "Which test runner would you like to use?",
					result: "vitest",
				});
				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"src/index.js": true,
						"src/index.test.js": true,
						"src/index.ts": false,
						"package.json": {
							contents: expect.objectContaining({
								name: expect.stringContaining("wrangler-tests"),
								version: "0.0.0",
								scripts: {
									start: "wrangler dev",
									deploy: "wrangler deploy",
									test: "vitest",
								},
							}),
						},
					},
				});
				expect(std.out).toMatchInlineSnapshot(`
			"✨ Created wrangler.toml
			✨ Created package.json
			✨ Created src/index.js
			✨ Created src/index.test.js
			✨ Installed vitest into devDependencies

			To start developing your Worker, run \`npm start\`
			To start testing your Worker, run \`npm test\`
			To publish your Worker to the Internet, run \`npm run deploy\`"
		`);
			});

			it("should not overwrite package.json scripts for a non-ts project with .js extension", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "Would you like to install wrangler into package.json?",
						result: false,
					},
					{
						text: "Would you like to use TypeScript?",
						result: false,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"src",
						"index.js"
					)}?`,
					result: "fetch",
				});
				mockConfirm({
					text: "Would you like us to write your first test?",
					result: false,
				});
				writeFiles({
					items: {
						"package.json": {
							contents: {
								scripts: {
									start: "test-start",
									deploy: "test-deploy",
								},
							},
						},
					},
				});

				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"src/index.js": true,
						"src/index.ts": false,
						"package.json": {
							contents: expect.objectContaining({
								scripts: {
									start: "test-start",
									deploy: "test-deploy",
								},
							}),
						},
					},
				});
				expect(std.out).toMatchInlineSnapshot(`
			        "✨ Created wrangler.toml
			        ✨ Created src/index.js

			        To start developing your Worker, run \`npx wrangler dev\`
			        To publish your Worker to the Internet, run \`npx wrangler deploy\`"
		      `);
			});

			it("should not offer to create a worker in a non-ts project if a file already exists at the location", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "Would you like to install wrangler into package.json?",
						result: false,
					},
					{
						text: "Would you like to use TypeScript?",
						result: false,
					}
				);
				const PLACEHOLDER = "/* placeholder text */";
				writeFiles({
					items: {
						"package.json": { contents: { name: "test", version: "1.0.0" } },
						"src/index.js": { contents: PLACEHOLDER },
					},
				});

				await runWrangler("init --no-delegate-c3");

				checkFiles({
					items: {
						"src/index.js": { contents: PLACEHOLDER },
						"src/index.ts": false,
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created wrangler.toml",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should not offer to create a worker in a non-ts named worker project if a file already exists at the location", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: `Would you like to install wrangler into ${path.join(
							"my-worker",
							"package.json"
						)}?`,
						result: false,
					},
					{
						text: "Would you like to use TypeScript?",
						result: false,
					}
				);
				const PLACEHOLDER = "/* placeholder text */";
				writeFiles({
					items: {
						"my-worker/package.json": {
							contents: { name: "test", version: "1.0.0" },
						},
						"my-worker/src/index.js": { contents: PLACEHOLDER },
					},
				});

				await runWrangler("init my-worker --no-delegate-c3");

				checkFiles({
					items: {
						"my-worker/src/index.js": { contents: PLACEHOLDER },
						"my-worker/src/index.ts": false,
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "✨ Created my-worker/wrangler.toml",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});
		});

		describe("worker names", () => {
			it("should create a worker with a given name", async () => {
				await runWrangler("init my-worker -y --no-delegate-c3");

				checkFiles({
					items: {
						"my-worker/wrangler.toml": wranglerToml({
							...MINIMAL_WRANGLER_TOML,
							name: "my-worker",
						}),
					},
				});
			});

			it('should create a worker with the name of the current directory if "name" is .', async () => {
				await runWrangler("init . -y --no-delegate-c3");

				const workerName = path.basename(process.cwd()).toLowerCase();
				checkFiles({
					items: {
						"wrangler.toml": wranglerToml({
							...MINIMAL_WRANGLER_TOML,
							name: workerName,
						}),
						"package.json": {
							contents: expect.objectContaining({
								name: expect.stringContaining("wrangler-tests"),
								version: "0.0.0",
								scripts: {
									deploy: "wrangler deploy",
									start: "wrangler dev",
									test: "vitest",
								},
								devDependencies: {
									wrangler: expect.any(String),
								},
							}),
						},
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "Your project will use Vitest to run your tests.",
			  "out": "✨ Created wrangler.toml
			✨ Initialized git repository
			✨ Created package.json
			✨ Created tsconfig.json
			✨ Created src/index.ts
			✨ Created src/index.test.ts
			✨ Installed @cloudflare/workers-types, typescript, and vitest into devDependencies

			To start developing your Worker, run \`npm start\`
			To start testing your Worker, run \`npm test\`
			To publish your Worker to the Internet, run \`npm run deploy\`",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2 -- --wrangler-defaults\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it('should create a worker in a nested directory if "name" is path/to/worker', async () => {
				await runWrangler("init path/to/worker -y --no-delegate-c3");

				checkFiles({
					items: {
						"path/to/worker/wrangler.toml": wranglerToml({
							...MINIMAL_WRANGLER_TOML,
							name: "worker",
						}),
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "Your project will use Vitest to run your tests.",
			  "out": "✨ Created path/to/worker/wrangler.toml
			✨ Initialized git repository at path/to/worker
			✨ Created path/to/worker/package.json
			✨ Created path/to/worker/tsconfig.json
			✨ Created path/to/worker/src/index.ts
			✨ Created path/to/worker/src/index.test.ts
			✨ Installed @cloudflare/workers-types, typescript, and vitest into devDependencies

			To start developing your Worker, run \`cd path/to/worker && npm start\`
			To start testing your Worker, run \`npm test\`
			To publish your Worker to the Internet, run \`npm run deploy\`",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2 -- --wrangler-defaults\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should normalize characters that aren't lowercase alphanumeric, underscores, or dashes", async () => {
				await runWrangler(
					"init WEIRD_w0rkr_N4m3.js.tsx.tar.gz -y --no-delegate-c3"
				);

				checkFiles({
					items: {
						"WEIRD_w0rkr_N4m3.js.tsx.tar.gz/wrangler.toml": wranglerToml({
							...MINIMAL_WRANGLER_TOML,
							name: "weird_w0rkr_n4m3-js-tsx-tar-gz",
						}),
					},
				});
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "Your project will use Vitest to run your tests.",
			  "out": "✨ Created WEIRD_w0rkr_N4m3.js.tsx.tar.gz/wrangler.toml
			✨ Initialized git repository at WEIRD_w0rkr_N4m3.js.tsx.tar.gz
			✨ Created WEIRD_w0rkr_N4m3.js.tsx.tar.gz/package.json
			✨ Created WEIRD_w0rkr_N4m3.js.tsx.tar.gz/tsconfig.json
			✨ Created WEIRD_w0rkr_N4m3.js.tsx.tar.gz/src/index.ts
			✨ Created WEIRD_w0rkr_N4m3.js.tsx.tar.gz/src/index.test.ts
			✨ Installed @cloudflare/workers-types, typescript, and vitest into devDependencies

			To start developing your Worker, run \`cd WEIRD_w0rkr_N4m3.js.tsx.tar.gz && npm start\`
			To start testing your Worker, run \`npm test\`
			To publish your Worker to the Internet, run \`npm run deploy\`",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init\` command is no longer supported. Please use \`mockpm create cloudflare@2 -- --wrangler-defaults\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);
			});

			it("should ignore ancestor files (such as wrangler.toml, package.json and tsconfig.json) if a name/path is given", async () => {
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: true,
					}
				);
				mockSelect({
					text: `Would you like to create a Worker at ${path.join(
						"sub",
						"folder",
						"worker",
						"src",
						"index.ts"
					)}?`,
					result: "fetch",
				});
				mockConfirm({
					text: "Would you like us to write your first test with Vitest?",
					result: true,
				});
				writeFiles({
					items: {
						"package.json": { contents: { name: "top-level" } },
						"tsconfig.json": { contents: { compilerOptions: {} } },
						"wrangler.toml": wranglerToml({
							name: "top-level",
							compatibility_date: "some-date",
						}),
					},
				});

				await runWrangler("init sub/folder/worker --no-delegate-c3");

				// Ancestor files are untouched.
				checkFiles({
					items: {
						"package.json": { contents: { name: "top-level" } },
						"tsconfig.json": {
							contents: { config: { compilerOptions: {} }, error: undefined },
						},
						"wrangler.toml": wranglerToml({
							name: "top-level",
							compatibility_date: "some-date",
						}),
					},
				});
				// New initialized Worker has its own files.
				checkFiles({
					items: {
						"sub/folder/worker/package.json": {
							contents: expect.objectContaining({
								name: "worker",
							}),
						},
						"sub/folder/worker/tsconfig.json": true,
						"sub/folder/worker/wrangler.toml": wranglerToml({
							...MINIMAL_WRANGLER_TOML,
							name: "worker",
						}),
					},
				});
			});
		});

		describe("from dashboard", () => {
			mockApiToken();
			mockAccountId({ accountId: "LCARS" });

			const mockDashboardScript = `
		export default {
			async fetch(request, env, ctx) {
				return new Response("Hello World!");
			},
		};
		`;
			afterEach(() => {
				// some test has a side-effect which is overwriting the compatibility_date
				mockServiceMetadata.default_environment.script.compatibility_date =
					"1987-9-27";
				mockConfigExpected.compatibility_date = "1987-9-27";
			});
			const mockServiceMetadata = {
				id: "memory-crystal",
				default_environment: {
					environment: "test",
					created_on: "1987-9-27",
					modified_on: "1987-9-27",
					script: {
						id: "memory-crystal",
						tag: "test-tag",
						etag: "some-etag",
						handlers: [],
						modified_on: "1987-9-27",
						created_on: "1987-9-27",
						migration_tag: "some-migration-tag",
						usage_model: "bundled",
						compatibility_date: "1987-9-27",
						tail_consumers: [{ service: "listener" }],
					},
				},
				created_on: "1987-9-27",
				modified_on: "1987-9-27",
				usage_model: "bundled",
				environments: [
					{
						environment: "test",
						created_on: "1987-9-27",
						modified_on: "1987-9-27",
					},
					{
						environment: "staging",
						created_on: "1987-9-27",
						modified_on: "1987-9-27",
					},
				],
			};
			const mockBindingsRes = [
				{
					type: "secret_text",
					name: "ABC",
				},
				{
					type: "plain_text",
					name: "ANOTHER-NAME",
					text: "thing-TEXT",
				},
				{
					type: "durable_object_namespace",
					name: "DURABLE_TEST",
					class_name: "Durability",
					script_name: "another-durable-object-worker",
					environment: "production",
				},
				{
					type: "kv_namespace",
					name: "kv_testing",
					namespace_id: "some-namespace-id",
				},
				{
					type: "r2_bucket",
					bucket_name: "test-bucket",
					name: "test-bucket",
				},
				{
					environment: "production",
					name: "website",
					service: "website",
					type: "service",
				},
				{
					type: "dispatch_namespace",
					name: "name-namespace-mock",
					namespace: "namespace-mock",
				},
				{
					name: "httplogs",
					type: "logfwdr",
					destination: "httplogs",
				},
				{
					name: "trace",
					type: "logfwdr",
					destination: "trace",
				},
				{
					type: "wasm_module",
					name: "WASM_MODULE_ONE",
					part: "./some_wasm.wasm",
				},
				{
					type: "wasm_module",
					name: "WASM_MODULE_TWO",
					part: "./more_wasm.wasm",
				},
				{
					type: "text_blob",
					name: "TEXT_BLOB_ONE",
					part: "./my-entire-app-depends-on-this.cfg",
				},
				{
					type: "text_blob",
					name: "TEXT_BLOB_TWO",
					part: "./the-entirety-of-human-knowledge.txt",
				},
				{ type: "data_blob", name: "DATA_BLOB_ONE", part: "DATA_BLOB_ONE" },
				{ type: "data_blob", name: "DATA_BLOB_TWO", part: "DATA_BLOB_TWO" },
				{
					type: "some unsafe thing",
					name: "UNSAFE_BINDING_ONE",
					data: { some: { unsafe: "thing" } },
				},
				{
					type: "another unsafe thing",
					name: "UNSAFE_BINDING_TWO",
					data: 1337,
				},
			];
			const mockRoutesRes = [
				{
					id: "some-route-id",
					pattern: "delta.quadrant",
				},
			];
			const mockConfigExpected = {
				main: "src/index.ts",
				compatibility_date: "1987-9-27",
				name: "isolinear-optical-chip",
				migrations: [
					{
						new_classes: ["Durability"],
						tag: "some-migration-tag",
					},
				],
				durable_objects: {
					bindings: [
						{
							class_name: "Durability",
							name: "DURABLE_TEST",
							script_name: "another-durable-object-worker",
							environment: "production",
						},
					],
				},
				kv_namespaces: [
					{
						binding: "kv_testing",
						id: "some-namespace-id",
					},
				],
				r2_buckets: [
					{
						bucket_name: "test-bucket",
						binding: "test-bucket",
					},
				],
				dispatch_namespaces: [
					{
						binding: "name-namespace-mock",
						namespace: "namespace-mock",
					},
				],
				route: "delta.quadrant",
				services: [
					{
						environment: "production",
						binding: "website",
						service: "website",
					},
				],
				triggers: {
					crons: ["0 0 0 * * *"],
				},
				usage_model: "bundled",
				vars: {
					"ANOTHER-NAME": "thing-TEXT",
				},
				env: {
					test: {},
					staging: {},
				},
				unsafe: {
					bindings: [
						{
							name: "UNSAFE_BINDING_ONE",
							type: "some unsafe thing",
							data: { some: { unsafe: "thing" } },
						},
						{
							name: "UNSAFE_BINDING_TWO",
							type: "another unsafe thing",
							data: 1337,
						},
					],
				},
				wasm_modules: {
					WASM_MODULE_ONE: "./some_wasm.wasm",
					WASM_MODULE_TWO: "./more_wasm.wasm",
				},
				text_blobs: {
					TEXT_BLOB_ONE: "./my-entire-app-depends-on-this.cfg",
					TEXT_BLOB_TWO: "./the-entirety-of-human-knowledge.txt",
				},
				data_blobs: {
					DATA_BLOB_ONE: "DATA_BLOB_ONE",
					DATA_BLOB_TWO: "DATA_BLOB_TWO",
				},
				logfwdr: {
					schema: "",
					bindings: [
						{
							name: "httplogs",
							destination: "httplogs",
						},
						{
							name: "trace",
							destination: "trace",
						},
					],
				},
				tail_consumers: [{ service: "listener" }],
			};

			function mockSupportingDashRequests({
				expectedAccountId = "",
				expectedScriptName = "",
				expectedEnvironment = "",
				expectedCompatDate,
			}: {
				expectedAccountId: string;
				expectedScriptName: string;
				expectedEnvironment: string;
				expectedCompatDate: string | undefined;
			}) {
				msw.use(
					rest.get(
						`*/accounts/:accountId/workers/services/:scriptName`,
						(req, res, ctx) => {
							expect(req.params.accountId).toEqual(expectedAccountId);
							expect(req.params.scriptName).toEqual(expectedScriptName);

							if (expectedCompatDate === undefined)
								(mockServiceMetadata.default_environment.script
									.compatibility_date as unknown) = expectedCompatDate;

							return res.once(
								ctx.status(200),
								ctx.json({
									success: true,
									errors: [],
									messages: [],
									result: mockServiceMetadata,
								})
							);
						}
					),
					rest.get(
						`*/accounts/:accountId/workers/services/:scriptName/environments/:environment/bindings`,
						(req, res, ctx) => {
							expect(req.params.accountId).toEqual(expectedAccountId);
							expect(req.params.scriptName).toEqual(expectedScriptName);
							expect(req.params.environment).toEqual(expectedEnvironment);

							return res.once(
								ctx.status(200),
								ctx.json({
									success: true,
									errors: [],
									messages: [],
									result: mockBindingsRes,
								})
							);
						}
					),
					rest.get(
						`*/accounts/:accountId/workers/services/:scriptName/environments/:environment/routes`,
						(req, res, ctx) => {
							expect(req.params.accountId).toEqual(expectedAccountId);
							expect(req.params.scriptName).toEqual(expectedScriptName);
							expect(req.params.environment).toEqual(expectedEnvironment);

							return res.once(
								ctx.status(200),
								ctx.json({
									success: true,
									errors: [],
									messages: [],
									result: mockRoutesRes,
								})
							);
						}
					),
					rest.get(
						`*/accounts/:accountId/workers/services/:scriptName/environments/:environment`,

						(req, res, ctx) => {
							expect(req.params.accountId).toEqual(expectedAccountId);
							expect(req.params.scriptName).toEqual(expectedScriptName);
							expect(req.params.environment).toEqual(expectedEnvironment);

							return res.once(
								ctx.status(200),
								ctx.json({
									success: true,
									errors: [],
									messages: [],
									result: mockServiceMetadata.default_environment,
								})
							);
						}
					),
					rest.get(
						`*/accounts/:accountId/workers/scripts/:scriptName/schedules`,
						(req, res, ctx) => {
							expect(req.params.accountId).toEqual(expectedAccountId);
							expect(req.params.scriptName).toEqual(expectedScriptName);

							return res.once(
								ctx.status(200),
								ctx.json({
									success: true,
									errors: [],
									messages: [],
									result: {
										schedules: [
											{
												cron: "0 0 0 * * *",
												created_on: new Date(1987, 9, 27),
												modified_on: new Date(1987, 9, 27),
											},
										],
									},
								})
							);
						}
					)
				);
			}

			test("shows deprecation warning and delegates to C3 --type pre-existing", async () => {
				mockSupportingDashRequests({
					expectedAccountId: "LCARS",
					expectedScriptName: "existing-memory-crystal",
					expectedEnvironment: "test",
					expectedCompatDate: "1987-9-27",
				});
				setMockFetchDashScript(mockDashboardScript);

				await runWrangler("init --from-dash existing-memory-crystal");

				checkFiles({
					items: {
						"./src/index.js": false,
						"./src/index.ts": false,
						"./tsconfig.json": false,
						"./package.json": false,
						"./wrangler.toml": false,
					},
				});

				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Running \`mockpm create cloudflare@2 existing-memory-crystal -- --type pre-existing --existing-script existing-memory-crystal\`...",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe \`init --from-dash\` command is no longer supported. Please use \`mockpm create cloudflare@2 existing-memory-crystal -- --type pre-existing --existing-script existing-memory-crystal\` instead.[0m

			  The \`init\` command will be removed in a future version.

			",
			}
		`);

				expect(execa).toHaveBeenCalledWith(
					"mockpm",
					["create", "cloudflare@2"],
					{ stdio: "inherit" }
				);
				expect(execa).toHaveBeenCalledWith("git", ["--version"]);
				expect(execa).toHaveBeenCalledWith("git", [
					"config",
					"--get",
					"init.defaultBranch",
				]);
			});

			//TODO: Tests for a case when a worker name doesn't exist - JACOB & CASS
			it("should download source script from dashboard w/ positional <name> in TypeScript project", async () => {
				mockSupportingDashRequests({
					expectedAccountId: "LCARS",
					expectedScriptName: "memory-crystal",
					expectedEnvironment: "test",
					expectedCompatDate: "1987-9-27",
				});
				setMockFetchDashScript(mockDashboardScript);
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: true,
					}
				);

				await runWrangler(
					"init isolinear-optical-chip --from-dash memory-crystal --no-delegate-c3"
				);

				expect(std.out).toContain("cd isolinear-optical-chip");

				checkFiles({
					items: {
						"isolinear-optical-chip/src/index.js": false,
						"isolinear-optical-chip/src/index.ts": {
							contents: mockDashboardScript,
						},
						"isolinear-optical-chip/package.json": {
							contents: expect.objectContaining({
								name: "isolinear-optical-chip",
							}),
						},
						"isolinear-optical-chip/tsconfig.json": true,
						"isolinear-optical-chip/wrangler.toml": wranglerToml({
							...mockConfigExpected,
						}),
					},
				});
			});

			it("should fail on init --from-dash on non-existent worker name", async () => {
				msw.use(
					rest.get(
						`*/accounts/:accountId/workers/services/:scriptName`,
						(req, res, ctx) => {
							return res.once(
								ctx.status(200),
								ctx.json({
									success: true,
									errors: [],
									messages: [],
									result: mockServiceMetadata,
								})
							);
						}
					)
				);
				setMockFetchDashScript(mockDashboardScript);
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: true,
					}
				);

				await expect(
					runWrangler(
						"init isolinear-optical-chip --from-dash i-dont-exist --no-delegate-c3"
					)
				).rejects.toThrowError();
			});

			it("should download source script from dashboard w/ out positional <name>", async () => {
				mockSupportingDashRequests({
					expectedAccountId: "LCARS",
					expectedScriptName: "isolinear-optical-chip",
					expectedEnvironment: "test",
					expectedCompatDate: "1987-9-27",
				});
				setMockFetchDashScript(mockDashboardScript);
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: true,
					}
				);

				await runWrangler(
					"init --from-dash isolinear-optical-chip --no-delegate-c3"
				);

				expect(
					fs.readFileSync("./isolinear-optical-chip/wrangler.toml", "utf8")
				).toMatchInlineSnapshot(`
			"name = \\"isolinear-optical-chip\\"
			main = \\"src/index.ts\\"
			compatibility_date = \\"1987-9-27\\"
			route = \\"delta.quadrant\\"
			usage_model = \\"bundled\\"

			[[migrations]]
			tag = \\"some-migration-tag\\"
			new_classes = [ \\"Durability\\" ]

			[triggers]
			crons = [ \\"0 0 0 * * *\\" ]

			[env]
			test = { }
			staging = { }

			[[tail_consumers]]
			service = \\"listener\\"

			[vars]
			ANOTHER-NAME = \\"thing-TEXT\\"

			[[durable_objects.bindings]]
			name = \\"DURABLE_TEST\\"
			class_name = \\"Durability\\"
			script_name = \\"another-durable-object-worker\\"
			environment = \\"production\\"

			[[kv_namespaces]]
			id = \\"some-namespace-id\\"
			binding = \\"kv_testing\\"

			[[r2_buckets]]
			binding = \\"test-bucket\\"
			bucket_name = \\"test-bucket\\"

			[[services]]
			binding = \\"website\\"
			service = \\"website\\"
			environment = \\"production\\"

			[[dispatch_namespaces]]
			binding = \\"name-namespace-mock\\"
			namespace = \\"namespace-mock\\"

			[logfwdr]
			schema = \\"\\"

			  [[logfwdr.bindings]]
			  name = \\"httplogs\\"
			  destination = \\"httplogs\\"

			  [[logfwdr.bindings]]
			  name = \\"trace\\"
			  destination = \\"trace\\"

			[wasm_modules]
			WASM_MODULE_ONE = \\"./some_wasm.wasm\\"
			WASM_MODULE_TWO = \\"./more_wasm.wasm\\"

			[text_blobs]
			TEXT_BLOB_ONE = \\"./my-entire-app-depends-on-this.cfg\\"
			TEXT_BLOB_TWO = \\"./the-entirety-of-human-knowledge.txt\\"

			[data_blobs]
			DATA_BLOB_ONE = \\"DATA_BLOB_ONE\\"
			DATA_BLOB_TWO = \\"DATA_BLOB_TWO\\"

			[unsafe]
			  [[unsafe.bindings]]
			  type = \\"some unsafe thing\\"
			  name = \\"UNSAFE_BINDING_ONE\\"

			[unsafe.bindings.data.some]
			unsafe = \\"thing\\"

			  [[unsafe.bindings]]
			  type = \\"another unsafe thing\\"
			  name = \\"UNSAFE_BINDING_TWO\\"
			  data = 1_337
			"
		`);
				expect(std.out).toContain("cd isolinear-optical-chip");

				checkFiles({
					items: {
						"isolinear-optical-chip/src/index.js": false,
						"isolinear-optical-chip/src/index.ts": {
							contents: mockDashboardScript,
						},
						"isolinear-optical-chip/package.json": {
							contents: expect.objectContaining({
								name: "isolinear-optical-chip",
							}),
						},
						"isolinear-optical-chip/tsconfig.json": true,
						"isolinear-optical-chip/wrangler.toml": wranglerToml({
							...mockConfigExpected,
							name: "isolinear-optical-chip",
						}),
					},
				});
			});

			it("should download source script from dashboard as plain JavaScript", async () => {
				mockSupportingDashRequests({
					expectedAccountId: "LCARS",
					expectedScriptName: "isolinear-optical-chip",
					expectedEnvironment: "test",
					expectedCompatDate: "1987-9-27",
				});
				setMockFetchDashScript(mockDashboardScript);
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: false,
					}
				);

				await runWrangler(
					"init  --from-dash isolinear-optical-chip --no-delegate-c3"
				);

				checkFiles({
					items: {
						"isolinear-optical-chip/src/index.js": {
							contents: mockDashboardScript,
						},
						"isolinear-optical-chip/src/index.ts": false,
						"isolinear-optical-chip/package.json": {
							contents: expect.objectContaining({
								name: "isolinear-optical-chip",
							}),
						},
						"isolinear-optical-chip/tsconfig.json": false,
						"isolinear-optical-chip/wrangler.toml": wranglerToml({
							...mockConfigExpected,
							name: "isolinear-optical-chip",
							main: "src/index.js",
						}),
					},
				});
			});

			it("should use fallback compatibility date if none is upstream", async () => {
				const mockDate = "1988-08-07";
				jest
					.spyOn(Date.prototype, "toISOString")
					.mockImplementation(() => `${mockDate}T00:00:00.000Z`);

				mockSupportingDashRequests({
					expectedAccountId: "LCARS",
					expectedScriptName: "isolinear-optical-chip",
					expectedEnvironment: "test",
					expectedCompatDate: undefined,
				});
				setMockFetchDashScript(mockDashboardScript);
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: true,
					}
				);

				await runWrangler(
					"init  --from-dash isolinear-optical-chip --no-delegate-c3"
				);

				mockConfigExpected.compatibility_date = "1988-08-07";
				checkFiles({
					items: {
						"isolinear-optical-chip/src/index.ts": {
							contents: mockDashboardScript,
						},
						"isolinear-optical-chip/package.json": {
							contents: expect.objectContaining({
								name: "isolinear-optical-chip",
							}),
						},
						"isolinear-optical-chip/tsconfig.json": true,
						"isolinear-optical-chip/wrangler.toml": wranglerToml({
							...mockConfigExpected,
							name: "isolinear-optical-chip",
						}),
					},
				});
			});

			it("should throw an error to retry if a request fails", async () => {
				msw.use(
					rest.get(
						`*/accounts/:accountId/workers/services/:scriptName`,
						(req, res, ctx) => {
							expect(req.params.accountId).toBe("LCARS");
							expect(req.params.scriptName).toBe("isolinear-optical-chip");
							return res.once(
								ctx.status(200),
								ctx.json({
									success: true,
									errors: [],
									messages: [],
									result: mockServiceMetadata,
								})
							);
						}
					),
					rest.get(
						`*/accounts/:accountId/workers/services/:scriptName/environments/:environment/bindings`,
						(req, res) => {
							return res.networkError("Mock Network Error");
						}
					)
				);

				setMockFetchDashScript(mockDashboardScript);
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "Would you like to use TypeScript?",
						result: false,
					}
				);

				await expect(
					runWrangler(
						"init --from-dash isolinear-optical-chip --no-delegate-c3"
					)
				).rejects.toThrowError();
			});

			it("should not include migrations in config file when none are necessary", async () => {
				const mockDate = "1988-08-07";
				jest
					.spyOn(Date.prototype, "toISOString")
					.mockImplementation(() => `${mockDate}T00:00:00.000Z`);
				const mockData = {
					id: "memory-crystal",
					default_environment: {
						environment: "test",
						created_on: "1988-08-07",
						modified_on: "1988-08-07",
						script: {
							id: "memory-crystal",
							tag: "test-tag",
							etag: "some-etag",
							handlers: [],
							modified_on: "1988-08-07",
							created_on: "1988-08-07",
							usage_model: "bundled",
							compatibility_date: "1988-08-07",
							tail_consumers: [{ service: "listener" }],
						},
					},
					environments: [],
				};
				msw.use(
					rest.get(
						`*/accounts/:accountId/workers/services/:scriptName`,
						(req, res, ctx) => {
							return res.once(
								ctx.status(200),
								ctx.json({
									success: true,
									errors: [],
									messages: [],
									result: mockData,
								})
							);
						}
					),
					rest.get(
						`*/accounts/:accountId/workers/services/:scriptName/environments/:environment/bindings`,
						(req, res, ctx) => {
							return res.once(
								ctx.status(200),
								ctx.json({
									success: true,
									errors: [],
									messages: [],
									result: [],
								})
							);
						}
					),
					rest.get(
						`*/accounts/:accountId/workers/services/:scriptName/environments/:environment/routes`,
						(req, res, ctx) => {
							return res.once(
								ctx.status(200),
								ctx.json({
									success: true,
									errors: [],
									messages: [],
									result: [],
								})
							);
						}
					),
					rest.get(
						`*/accounts/:accountId/workers/services/:scriptName/environments/:environment`,
						(req, res, ctx) => {
							return res.once(
								ctx.status(200),
								ctx.json({
									success: true,
									errors: [],
									messages: [],
									result: mockData.default_environment,
								})
							);
						}
					),
					rest.get(
						`*/accounts/:accountId/workers/scripts/:scriptName/schedules`,
						(req, res, ctx) => {
							return res.once(
								ctx.status(200),
								ctx.json({
									success: true,
									errors: [],
									messages: [],
									result: { schedules: [] },
								})
							);
						}
					)
				);

				setMockFetchDashScript(mockDashboardScript);

				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},

					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: true,
					}
				);

				await runWrangler(
					"init  --from-dash isolinear-optical-chip --no-delegate-c3"
				);

				checkFiles({
					items: {
						"isolinear-optical-chip/wrangler.toml": wranglerToml({
							compatibility_date: "1988-08-07",
							env: {},
							main: "src/index.ts",
							triggers: {
								crons: [],
							},
							usage_model: "bundled",
							name: "isolinear-optical-chip",
							tail_consumers: [{ service: "listener" }],
						}),
					},
				});
			});

			it("should not continue if no worker name is provided", async () => {
				await expect(
					runWrangler("init  --from-dash")
				).rejects.toMatchInlineSnapshot(
					`[Error: Not enough arguments following: from-dash]`
				);
				checkFiles({
					items: {
						"isolinear-optical-chip/src/index.js": false,
						"isolinear-optical-chip/src/index.ts": false,
						"isolinear-optical-chip/package.json": false,
						"isolinear-optical-chip/tsconfig.json": false,
						"isolinear-optical-chip/wrangler.toml": false,
					},
				});
			});

			it("should download multi-module source scripts from dashboard", async () => {
				mockSupportingDashRequests({
					expectedAccountId: "LCARS",
					expectedScriptName: "isolinear-optical-chip",
					expectedEnvironment: "test",
					expectedCompatDate: "1987-9-27",
				});
				const indexjs = `
					import handleRequest from './handleRequest.js';

					export default {
						async fetch(request, env, ctx) {
							return handleRequest(request, env, ctx);
						},
					};
				`;
				const otherjs = `
					export default function (request, env, ctx) {
						return new Response("Hello World!");
					}
				`;
				setMockFetchDashScript([
					{ name: "index.js", contents: indexjs },
					{ name: "nested/other.js", contents: otherjs },
				]);
				mockConfirm(
					{
						text: "Would you like to use git to manage this Worker?",
						result: false,
					},
					{
						text: "No package.json found. Would you like to create one?",
						result: true,
					},
					{
						text: "Would you like to use TypeScript?",
						result: false,
					}
				);

				await runWrangler(
					"init --from-dash isolinear-optical-chip  --no-delegate-c3"
				);

				checkFiles({
					items: {
						"isolinear-optical-chip/src/index.js": {
							contents: indexjs,
						},
						"isolinear-optical-chip/src/nested/other.js": {
							contents: otherjs,
						},
						"isolinear-optical-chip/src/index.ts": false,
						"isolinear-optical-chip/package.json": {
							contents: expect.objectContaining({
								name: "isolinear-optical-chip",
							}),
						},
						"isolinear-optical-chip/tsconfig.json": false,
						"isolinear-optical-chip/wrangler.toml": wranglerToml({
							...mockConfigExpected,
							name: "isolinear-optical-chip",
							main: "src/index.js",
						}),
					},
				});
			});
		});
	});
});

function getDefaultBranchName() {
	try {
		const { stdout: defaultBranchName } = execaSync("git", [
			"config",
			"--get",
			"init.defaultBranch",
		]);

		return defaultBranchName;
	} catch {
		// ew
		return "master";
	}
}

/**
 * Mock setter for usage within test blocks for dashboard script
 */
export function setMockFetchDashScript(
	mockResponse: string | { name: string; contents: string }[]
) {
	msw.use(
		rest.get(
			`*/accounts/:accountId/workers/services/:fromDashScriptName/environments/:environment/content`,
			(_, res, ctx) => {
				if (typeof mockResponse === "string") {
					return res(ctx.text(mockResponse));
				}

				const fd = new FormData();

				for (const { name, contents } of mockResponse) {
					fd.set(name, contents);
				}

				const boundary = "--------boundary-12761293712";
				const responseText =
					`--${boundary}\r\n` +
					mockResponse
						.map(
							({ name, contents }) =>
								`Content-Disposition: form-data; name="${name}"\r\n\r\n${contents}`
						)
						.join(`\r\n--${boundary}\r\n`) +
					`\r\n--${boundary}--`;

				return res(
					ctx.set("Content-Type", `multipart/form-data; boundary=${boundary}`),
					ctx.body(responseText)
				);
			}
		)
	);
}

/**
 * Change the current working directory, ensuring that this exists.
 */
function setWorkingDirectory(directory: string) {
	fs.mkdirSync(directory, { recursive: true });
	process.chdir(directory);
}

/**
 * Write the given folder/files to disk at the given `cwd`.
 */
function writeFiles(folder: TestFolder, cwd = process.cwd()) {
	for (const name in folder.items) {
		const item = folder.items[name];
		const itemPath = path.resolve(cwd, name);
		if (typeof item !== "boolean") {
			if ("contents" in item) {
				fs.mkdirSync(path.dirname(itemPath), { recursive: true });
				fs.writeFileSync(itemPath, stringify(name, item.contents));
			} else {
				fs.mkdirSync(itemPath, { recursive: true });
				writeFiles(item, itemPath);
			}
		} else {
			throw new Error("Cannot write boolean flags to disk: " + itemPath);
		}
	}
}

/**
 * Check that the given test folders/files match what is in on disk.
 */
function checkFiles(folder: TestFolder, cwd = process.cwd()) {
	for (const name in folder.items) {
		const item = folder.items[name];
		const itemPath = path.resolve(cwd, name);
		if (typeof item === "boolean") {
			if (fs.existsSync(itemPath) !== item) {
				throw new Error(`Expected ${itemPath} ${item ? "" : "not "}to exist.`);
			}
		} else if ("contents" in item) {
			const actualContents = parse(name, fs.readFileSync(itemPath, "utf-8"));
			expect(actualContents).toEqual(item.contents);
		} else if ("items" in item) {
			checkFiles(item, itemPath);
		} else {
			throw new Error("Unexpected TestFile object.");
		}
	}
}

function stringify(name: string, value: unknown) {
	if (name.endsWith(".toml")) {
		return TOML.stringify(value as TOML.JsonMap);
	}
	if (name.endsWith(".json")) {
		return JSON.stringify(value);
	}
	return `${value}`;
}

function parse(name: string, value: string): unknown {
	if (name.endsWith(".toml")) {
		return TOML.parse(value);
	}
	if (name.endsWith("tsconfig.json")) {
		return parseConfigFileTextToJson(name, value);
	}
	if (name.endsWith(".json")) {
		return JSON.parse(value);
	}
	return value;
}

function wranglerToml(options: TOML.JsonMap = {}): TestFile {
	return {
		contents: options,
	};
}

interface TestFile {
	contents: unknown;
}
interface TestFolder {
	items: {
		[id: string]: TestFile | TestFolder | boolean;
	};
}
