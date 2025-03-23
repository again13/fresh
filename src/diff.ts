import { deepStrictEqual } from "assert";
import { createSearcheeFromMetafile, Searchee } from "./searchee.js";
import { parseTorrentFromFilename } from "./torrent.js";

function diff(thing1, thing2) {
	console.log(
		"Use `cross-seed tree` on each .torrent file to display their full structure",
	);
	try {
		deepStrictEqual(thing1, thing2);
		console.log(thing1);
		console.log("Torrents are equal");
	} catch (e) {
		console.log(e);
	}
}

export async function diffCmd(first: string, second: string): Promise<void> {
	let firstMeta = await parseTorrentFromFilename(first);
	let secondMeta = await parseTorrentFromFilename(second);
	let firstRes = createSearcheeFromMetafile(firstMeta);
	if (firstRes.isErr()) {
		console.log(firstRes.unwrapErr());
		return;
	}
	let secondRes = createSearcheeFromMetafile(secondMeta);
	if (secondRes.isErr()) {
		console.log(secondRes.unwrapErr());
		return;
	}
	let s1 = firstRes.unwrap();
	let s2 = secondRes.unwrap();
	let sortBy =
		s1.files.length === 1
			? (a, b) => b.length - a.length
			: s2.files.length === 1
				? (a, b) => a.length - b.length
				: (a, b) => a.path.localeCompare(b.path);

	let stripForDiff = (searchee: Searchee) => {
		for (let key of Object.keys(searchee)) {
			if (key !== "files") delete searchee[key];
		}
		searchee.files.sort(sortBy);
		return searchee;
	};
	return diff(stripForDiff(s1), stripForDiff(s2));
}
