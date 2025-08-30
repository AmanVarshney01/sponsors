#!/usr/bin/env bun

import { join } from "path";

const BUCKET_NAME = "sponsors" as const;
const SOURCE_DIR: string = process.cwd();

const args: string[] = process.argv.slice(2);
const autoYes: boolean = args.includes("--yes") || args.includes("-y");

async function fileExists(path: string): Promise<boolean> {
	return await Bun.file(path).exists();
}

async function runSponsorProcessor(): Promise<void> {
	console.log("🚀 Processing GitHub sponsorship data...");
	try {
		await Bun.$`bun scripts/process-sponsors.ts`;
	} catch (err) {
		console.error("❌ Failebd to run sponsor processor:", err);
		process.exit(1);
	}
}

async function generateSponsorBanner(): Promise<void> {
	console.log("🎨 Generating sponsor banner...");
	try {
		await Bun.$`bun scripts/generate-sponsors.ts`;
	} catch (err) {
		console.error("❌ Failed to generate sponsor banner:", err);
		process.exit(1);
	}
}

async function generatePNG(): Promise<void> {
	console.log("🖼️  Converting SVG to PNG...");
	try {
		await Bun.$`bunx sharp-cli -i generated/sponsors.svg -o generated/sponsors.png`;
	} catch (err) {
		console.error("❌ Failed to generate PNG:", err);
		process.exit(1);
	}
}

async function uploadToR2(sourceFile: string, targetKey: string): Promise<void> {
	const filePath = `${SOURCE_DIR}/${sourceFile}`;
	if (!(await fileExists(filePath))) {
		console.warn(`⚠️  Warning: ${filePath} does not exist.`);
		return;
	}

	console.log(`📤 Uploading ${filePath} to r2://${BUCKET_NAME}/${targetKey} ...`);

	try {
		await Bun.$`bunx wrangler r2 object put ${`${BUCKET_NAME}/${targetKey}`} --file=${filePath} --remote`;
		console.log(`✅ Successfully uploaded ${targetKey}`);
	} catch (err) {
		console.error(`❌ Failed to upload ${targetKey}:`, err);
	}
}

async function main(): Promise<void> {
	await runSponsorProcessor();
	await generateSponsorBanner();
	await generatePNG();

	if (!autoYes) {
		console.log(
			"\n💡 Skipping upload (no --yes flag). Run with --yes to upload to R2.",
		);
		console.log("\nGenerated files:");
		console.log("  • generated/sponsors.json - UI-compatible sponsor data");
		console.log("  • generated/sponsors.svg - Clean sponsor banner");
		console.log("  • generated/sponsors.png - PNG version of banner");
		return;
	}

	console.log("\n📤 Uploading files to R2...");

	await uploadToR2("generated/sponsors.json", "sponsors.json");
	await uploadToR2("generated/sponsors.svg", "sponsors.svg");
	await uploadToR2("generated/sponsors.png", "sponsors.png");

	console.log(`\n✅ All files uploaded to R2 bucket: ${BUCKET_NAME}`);
	console.log("\nFiles available at:");
	console.log(`  • https://sponsors.amanvarshney.com/sponsors.json`);
	console.log(`  • https://sponsors.amanvarshney.com/sponsors.svg`);
	console.log(`  • https://sponsors.amanvarshney.com/sponsors.png`);
}

main().catch((e: unknown) => {
	console.error("❌ Unexpected error:", e);
	process.exit(1);
});
