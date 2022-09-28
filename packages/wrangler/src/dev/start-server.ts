import { fork } from "node:child_process";
import { realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import * as util from "node:util";
import onExit from "signal-exit";
import tmp from "tmp-promise";
import { bundleWorker } from "../bundle";
import {
	getBoundRegisteredWorkers,
	registerWorker,
	startWorkerRegistry,
	stopWorkerRegistry,
} from "../dev-registry";
import { runCustomBuild } from "../entry";
import { logger } from "../logger";
import { waitForPortToBeAvailable } from "../proxy";
import {
	setupBindings,
	setupExperimentalLocal,
	setupMiniflareOptions,
	setupNodeOptions,
} from "./local";
import { validateDevProps } from "./validate-dev-props";

import type { Config } from "../config";
import type { WorkerRegistry } from "../dev-registry";
import type { Entry } from "../entry";
import type { DevProps, DirectorySyncResult } from "./dev";
import type { LocalProps } from "./local";
import type { EsbuildBundle } from "./use-esbuild";
import type { Miniflare as Miniflare3Type } from "@miniflare/tre";
import type { MiniflareOptions } from "miniflare";

import type { ChildProcess } from "node:child_process";

export async function startDevServer(
	props: DevProps & {
		local: boolean;
	}
) {
	try {
		let workerDefinitions: WorkerRegistry = {};
		validateDevProps(props);

		if (props.build.command) {
			const relativeFile =
				path.relative(props.entry.directory, props.entry.file) || ".";
			await runCustomBuild(props.entry.file, relativeFile, props.build).catch(
				(err) => {
					logger.error("Custom build failed:", err);
				}
			);
		}

		//implement a react-free version of useTmpDir
		const directory = setupTempDir();
		if (!directory) {
			throw new Error("Failed to create temporary directory.");
		}

		//start the worker registry
		startWorkerRegistry().catch((err) => {
			logger.error("failed to start worker registry", err);
		});
		if (props.local) {
			const boundRegisteredWorkers = await getBoundRegisteredWorkers({
				services: props.bindings.services,
				durableObjects: props.bindings.durable_objects,
			});

			if (!util.isDeepStrictEqual(boundRegisteredWorkers, workerDefinitions)) {
				workerDefinitions = boundRegisteredWorkers || {};
			}
		}

		//implement a react-free version of useEsbuild
		const bundle = await runEsbuild({
			entry: props.entry,
			destination: directory.name,
			jsxFactory: props.jsxFactory,
			rules: props.rules,
			jsxFragment: props.jsxFragment,
			serveAssetsFromWorker: Boolean(
				props.assetPaths && !props.isWorkersSite && props.local
			),
			tsconfig: props.tsconfig,
			minify: props.minify,
			nodeCompat: props.nodeCompat,
			define: props.define,
			noBundle: props.noBundle,
			assets: props.assetsConfig,
			workerDefinitions,
			services: props.bindings.services,
			firstPartyWorkerDevFacade: props.firstPartyWorker,
			testScheduled: props.testScheduled,
			experimentalLocalStubCache: props.experimentalLocal,
		});

		//run local now
		const { stop, inspectorUrl } = await startLocalServer({
			name: props.name,
			bundle: bundle,
			format: props.entry.format,
			compatibilityDate: props.compatibilityDate,
			compatibilityFlags: props.compatibilityFlags,
			bindings: props.bindings,
			assetPaths: props.assetPaths,
			port: props.port,
			ip: props.ip,
			rules: props.rules,
			inspectorPort: props.inspectorPort,
			localPersistencePath: props.localPersistencePath,
			liveReload: props.liveReload,
			crons: props.crons,
			localProtocol: props.localProtocol,
			localUpstream: props.localUpstream,
			logPrefix: props.logPrefix,
			inspect: props.inspect,
			onReady: props.onReady,
			enablePagesAssetsServiceBinding: props.enablePagesAssetsServiceBinding,
			usageModel: props.usageModel,
			workerDefinitions,
			experimentalLocal: props.experimentalLocal,
		});

		return {
			stop: async () => {
				stop();
				await stopWorkerRegistry();
			},
			inspectorUrl,
		};
	} catch (err) {
		logger.error(err);
	}
}

function setupTempDir(): DirectorySyncResult | undefined {
	let dir: DirectorySyncResult | undefined;
	try {
		dir = tmp.dirSync({ unsafeCleanup: true });

		return dir;
	} catch (err) {
		logger.error("Failed to create temporary directory to store built files.");
	}
}

async function runEsbuild({
	entry,
	destination,
	jsxFactory,
	jsxFragment,
	rules,
	assets,
	serveAssetsFromWorker,
	tsconfig,
	minify,
	nodeCompat,
	define,
	noBundle,
	workerDefinitions,
	services,
	firstPartyWorkerDevFacade,
	testScheduled,
	experimentalLocalStubCache,
}: {
	entry: Entry;
	destination: string | undefined;
	jsxFactory: string | undefined;
	jsxFragment: string | undefined;
	rules: Config["rules"];
	assets: Config["assets"];
	define: Config["define"];
	services: Config["services"];
	serveAssetsFromWorker: boolean;
	tsconfig: string | undefined;
	minify: boolean | undefined;
	nodeCompat: boolean | undefined;
	noBundle: boolean;
	workerDefinitions: WorkerRegistry;
	firstPartyWorkerDevFacade: boolean | undefined;
	testScheduled?: boolean;
	experimentalLocalStubCache: boolean | undefined;
}): Promise<EsbuildBundle | undefined> {
	if (!destination) return;

	const {
		resolvedEntryPointPath,
		bundleType,
		modules,
		sourceMapPath,
	}: Awaited<ReturnType<typeof bundleWorker>> = noBundle
		? {
				modules: [],
				resolvedEntryPointPath: entry.file,
				bundleType: entry.format === "modules" ? "esm" : "commonjs",
				stop: undefined,
				sourceMapPath: undefined,
		  }
		: await bundleWorker(entry, destination, {
				serveAssetsFromWorker,
				jsxFactory,
				jsxFragment,
				rules,
				tsconfig,
				minify,
				nodeCompat,
				define,
				checkFetch: true,
				assets: assets && {
					...assets,
					// disable the cache in dev
					bypassCache: true,
				},
				workerDefinitions,
				services,
				firstPartyWorkerDevFacade,
				targetConsumer: "dev", // We are starting a dev server
				local: false,
				testScheduled,
				experimentalLocalStubCache,
		  });

	return {
		id: 0,
		entry,
		path: resolvedEntryPointPath,
		type: bundleType,
		modules,
		sourceMapPath,
	};
}

export async function startLocalServer({
	name: workerName,
	bundle,
	format,
	compatibilityDate,
	compatibilityFlags,
	usageModel,
	bindings,
	workerDefinitions,
	assetPaths,
	port,
	inspectorPort,
	rules,
	localPersistencePath,
	liveReload,
	ip,
	crons,
	localProtocol,
	localUpstream,
	inspect,
	onReady,
	logPrefix,
	enablePagesAssetsServiceBinding,
	experimentalLocal,
}: LocalProps) {
	let local: ChildProcess | undefined;
	let experimentalLocalRef: Miniflare3Type | undefined;
	let removeSignalExitListener: (() => void) | undefined;
	let inspectorUrl: string | undefined;
	const setInspectorUrl = (url: string) => {
		inspectorUrl = url;
	};

	const abortController = new AbortController();
	async function startLocalWorker() {
		if (!bundle || !format) return;

		// port for the worker

		if (port !== 0) {
			await waitForPortToBeAvailable(port, {
				retryPeriod: 200,
				timeout: 2000,
				abortSignal: abortController.signal,
			});
		}

		if (bindings.services && bindings.services.length > 0) {
			logger.warn(
				"⎔ Support for service bindings in local mode is experimental and may change."
			);
		}

		// In local mode, we want to copy all referenced modules into
		// the output bundle directory before starting up
		for (const module of bundle.modules) {
			await writeFile(
				path.join(path.dirname(bundle.path), module.name),
				module.content
			);
		}

		const scriptPath = realpathSync(bundle.path);

		const upstream =
			typeof localUpstream === "string"
				? `${localProtocol}://${localUpstream}`
				: undefined;

		const {
			externalDurableObjects,
			internalDurableObjects,
			wasmBindings,
			textBlobBindings,
			dataBlobBindings,
		} = setupBindings({
			wasm_modules: bindings.wasm_modules,
			text_blobs: bindings.text_blobs,
			data_blobs: bindings.data_blobs,
			durable_objects: bindings.durable_objects,
			format,
			bundle,
		});

		const { forkOptions, miniflareCLIPath } = setupMiniflareOptions({
			workerName,
			port,
			scriptPath,
			localProtocol,
			ip,
			format,
			rules,
			compatibilityDate,
			compatibilityFlags,
			usageModel,
			kv_namespaces: bindings?.kv_namespaces,
			r2_buckets: bindings?.r2_buckets,
			d1_databases: bindings?.d1_databases,
			internalDurableObjects,
			externalDurableObjects,
			localPersistencePath,
			liveReload,
			assetPaths,
			vars: bindings?.vars,
			wasmBindings,
			textBlobBindings,
			dataBlobBindings,
			crons,
			upstream,
			logPrefix,
			workerDefinitions,
			enablePagesAssetsServiceBinding,
		});

		if (experimentalLocal) {
			// TODO: refactor setupMiniflareOptions so we don't need to parse here
			const mf2Options: MiniflareOptions = JSON.parse(forkOptions[0]);
			const mf = await setupExperimentalLocal(mf2Options, format, bundle);
			const runtimeURL = await mf.ready;
			experimentalLocalRef = mf;
			removeSignalExitListener = onExit((_code, _signal) => {
				logger.log("⎔ Shutting down experimental local server.");
				mf.dispose();
				experimentalLocalRef = undefined;
			});
			onReady?.(runtimeURL.hostname, parseInt(runtimeURL.port ?? 8787));
			return;
		}

		const nodeOptions = setupNodeOptions({ inspect, ip, inspectorPort });
		logger.log("⎔ Starting a local server...");

		const child = (local = fork(miniflareCLIPath, forkOptions, {
			cwd: path.dirname(scriptPath),
			execArgv: nodeOptions,
			stdio: "pipe",
		}));

		child.on("message", async (messageString) => {
			const message = JSON.parse(messageString as string);
			if (message.ready) {
				// Let's register our presence in the dev registry
				if (workerName) {
					await registerWorker(workerName, {
						protocol: localProtocol,
						mode: "local",
						port: message.mfPort,
						host: ip,
						durableObjects: internalDurableObjects.map((binding) => ({
							name: binding.name,
							className: binding.class_name,
						})),
						...(message.durableObjectsPort
							? {
									durableObjectsHost: ip,
									durableObjectsPort: message.durableObjectsPort,
							  }
							: {}),
					});
				}
				onReady?.(ip, message.mfPort);
			}
		});

		child.on("close", (code) => {
			if (code) {
				logger.log(`Miniflare process exited with code ${code}`);
			}
		});

		child.stdout?.on("data", (data: Buffer) => {
			process.stdout.write(data);
		});

		// parse the node inspector url (which may be received in chunks) from stderr
		let stderrData = "";
		let inspectorUrlFound = false;
		child.stderr?.on("data", (data: Buffer) => {
			if (!inspectorUrlFound) {
				stderrData += data.toString();
				const matches =
					/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9-]+)[\r|\n]/.exec(
						stderrData
					);
				if (matches) {
					inspectorUrlFound = true;
					setInspectorUrl(matches[1]);
				}
			}

			process.stderr.write(data);
		});

		child.on("exit", (code) => {
			if (code) {
				logger.error(`Miniflare process exited with code ${code}`);
			}
		});

		child.on("error", (error: Error) => {
			logger.error(`Miniflare process failed to spawn`);
			logger.error(error);
		});

		removeSignalExitListener = onExit((_code, _signal) => {
			logger.log("⎔ Shutting down local server.");
			child.kill();
			local = undefined;
		});
	}

	startLocalWorker().catch((err) => {
		logger.error("local worker:", err);
	});

	return {
		inspectorUrl,
		stop: () => {
			abortController.abort();
			if (local) {
				logger.log("⎔ Shutting down local server.");
				local.kill();
				local = undefined;
			}
			if (experimentalLocalRef) {
				logger.log("⎔ Shutting down experimental local server.");
				// Initialisation errors are also thrown asynchronously by dispose().
				// The catch() above should've caught them though.
				experimentalLocalRef?.dispose().catch(() => {});
				experimentalLocalRef = undefined;
			}
			removeSignalExitListener?.();
			removeSignalExitListener = undefined;
		},
	};
}
