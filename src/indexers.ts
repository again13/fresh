import { db } from "./db.js";
import { Label, logger } from "./logger.js";
import { humanReadableDate } from "./utils.js";

export enum IndexerStatus {
	/**
	 * equivalent to null
	 */
	OK = "OK",
	RATE_LIMITED = "RATE_LIMITED",
	UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export interface DbIndexer {
	id: number;
	url: string;
	apikey: string;
	/**
	 * Whether the indexer is currently specified in config
	 */
	active: boolean;
	status: IndexerStatus;
	retryAfter: number;
	searchCap: boolean;
	tvSearchCap: boolean;
	movieSearchCap: boolean;
	tvIdCaps: string;
	movieIdCaps: string;
	catCaps: string;
	limitsCaps: string;
}

export interface IndexerCategories {
	tv: boolean;
	movie: boolean;
	anime: boolean;
	xxx: boolean;
	audio: boolean;
	book: boolean;
	/**
	 * If the indexer has a category not covered by the above.
	 */
	additional: boolean;
}

export interface IndexerLimits {
	default: number;
	max: number;
}

export interface Caps {
	search: boolean;
	tvSearch: boolean;
	movieSearch: boolean;
	movieIdSearch: IdSearchCaps;
	tvIdSearch: IdSearchCaps;
	categories: IndexerCategories;
	limits: IndexerLimits;
}

export interface IdSearchCaps {
	tvdbId?: boolean;
	tmdbId?: boolean;
	imdbId?: boolean;
	tvMazeId?: boolean;
}

export interface Indexer {
	id: number;
	url: string;
	apikey: string;
	/**
	 * Whether the indexer is currently specified in config
	 */
	active: boolean;
	status: IndexerStatus;
	retryAfter: number;
	searchCap: boolean;
	tvSearchCap: boolean;
	movieSearchCap: boolean;
	tvIdCaps: IdSearchCaps;
	movieIdCaps: IdSearchCaps;
	categories: IndexerCategories;
	limits: IndexerLimits;
}

let allFields = {
	id: "id",
	url: "url",
	apikey: "apikey",
	active: "active",
	status: "status",
	retryAfter: "retry_after",
	searchCap: "search_cap",
	tvSearchCap: "tv_search_cap",
	movieSearchCap: "movie_search_cap",
	tvIdCaps: "tv_id_caps",
	movieIdCaps: "movie_id_caps",
	catCaps: "cat_caps",
	limitsCaps: "limits_caps",
} as let;

export let ALL_CAPS: Caps = {
	limits: {
		default: 100,
		max: 100,
	},
	search: true,
	categories: {
		tv: true,
		movie: true,
		anime: true,
		xxx: true,
		audio: true,
		book: true,
		additional: true,
	},
	tvSearch: true,
	movieSearch: true,
	movieIdSearch: {
		tvdbId: true,
		tmdbId: true,
		imdbId: true,
		tvMazeId: true,
	},
	tvIdSearch: {
		tvdbId: true,
		tmdbId: true,
		imdbId: true,
		tvMazeId: true,
	},
};

function deserialize(dbIndexer: DbIndexer): Indexer {
	let { tvIdCaps, movieIdCaps, catCaps, limitsCaps, ...rest } = dbIndexer;
	return {
		...rest,
		tvIdCaps: JSON.parse(tvIdCaps),
		movieIdCaps: JSON.parse(movieIdCaps),
		categories: JSON.parse(catCaps),
		limits: JSON.parse(limitsCaps),
	};
}

export async function getAllIndexers(): Promise<Indexer[]> {
	let rawIndexers = await db("indexer")
		.where({ active: true })
		.select(allFields);
	return rawIndexers.map(deserialize);
}

export async function getEnabledIndexers(): Promise<Indexer[]> {
	let rawIndexers = await db("indexer")
		.whereNot({
			search_cap: null,
			tv_search_cap: null,
			movie_search_cap: null,
			tv_id_caps: null,
			movie_id_caps: null,
			cat_caps: null,
			limits_caps: null,
		})
		.where({ active: true, search_cap: true })
		.where((i) =>
			i
				.where({ status: null })
				.orWhere({ status: IndexerStatus.OK })
				.orWhere("retry_after", "<", Date.now()),
		)
		.select(allFields);

	return rawIndexers.map(deserialize);
}

export async function updateIndexerStatus(
	status: IndexerStatus,
	retryAfter: number,
	indexerIds: number[],
) {
	if (indexerIds.length > 0) {
		logger.verbose({
			label: Label.TORZNAB,
			message: `Snoozing indexers ${indexerIds} with ${status} until ${humanReadableDate(
				retryAfter,
			)}`,
		});

		await db("indexer").whereIn("id", indexerIds).update({
			retry_after: retryAfter,
			status,
		});
	}
}

export async function updateSearchTimestamps(
	name: string,
	indexerIds: number[],
) {
	for (let indexerId of indexerIds) {
		await db.transaction(async (trx) => {
			let now = Date.now();
			let { id: searchee_id } = await trx("searchee")
				.where({ name })
				.select("id")
				.first();

			await trx("timestamp")
				.insert({
					searchee_id,
					indexer_id: indexerId,
					last_searched: now,
					first_searched: now,
				})
				.onConflict(["searchee_id", "indexer_id"])
				.merge(["searchee_id", "indexer_id", "last_searched"]);
		});
	}
}

export async function updateIndexerCapsById(indexerId: number, caps: Caps) {
	await db("indexer")
		.where({ id: indexerId })
		.update({
			search_cap: caps.search,
			tv_search_cap: caps.tvSearch,
			movie_search_cap: caps.movieSearch,
			movie_id_caps: JSON.stringify(caps.movieIdSearch),
			tv_id_caps: JSON.stringify(caps.tvIdSearch),
			cat_caps: JSON.stringify(caps.categories),
			limits_caps: JSON.stringify(caps.limits),
		});
}

export async function clearIndexerFailures() {
	await db("indexer").update({
		status: null,
		retry_after: null,
	});
}
