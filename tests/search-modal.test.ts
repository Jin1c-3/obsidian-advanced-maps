import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as obsidian from 'obsidian';
import type { App, RequestUrlResponse } from 'obsidian';
import { NOMINATIM_INTERVAL_MS, PlaceSearchModal, QUIET_MS } from '../src/search-modal';

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function response(json: unknown): RequestUrlResponse {
	return { status: 200, json } as RequestUrlResponse;
}

function amap(name: string): RequestUrlResponse {
	return response({
		status: '1',
		pois: [{ name, location: '120.1,30.2', pname: '', cityname: '', adname: '', address: '' }],
	});
}

function nominatim(name: string): RequestUrlResponse {
	return response([{ name, display_name: `${name}, Hangzhou`, lat: '30.2', lon: '120.1' }]);
}

function modal(provider: 'amap' | 'nominatim' = 'amap'): PlaceSearchModal {
	return new PlaceSearchModal({} as App, provider, 'key', 'coords', () => undefined);
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('PlaceSearchModal request ordering', () => {
	it('a short query cancels an older debounce instead of letting it request', async () => {
		const request = vi.spyOn(obsidian, 'requestUrl');
		const search = modal();
		const old = search.getSuggestions('West Lake');
		await vi.advanceTimersByTimeAsync(100);
		await expect(search.getSuggestions('x')).resolves.toEqual([]);
		await vi.advanceTimersByTimeAsync(QUIET_MS);

		await expect(old).resolves.toEqual([]);
		expect(request).not.toHaveBeenCalled();
	});

	it('drops an older response that arrives after a newer query', async () => {
		const oldResponse = deferred<RequestUrlResponse>();
		const newResponse = deferred<RequestUrlResponse>();
		const request = vi
			.spyOn(obsidian, 'requestUrl')
			.mockImplementationOnce(() => oldResponse.promise as never)
			.mockImplementationOnce(() => newResponse.promise as never);
		const search = modal();

		const old = search.getSuggestions('old place');
		await vi.advanceTimersByTimeAsync(QUIET_MS);
		const current = search.getSuggestions('new place');
		await vi.advanceTimersByTimeAsync(QUIET_MS);
		expect(request).toHaveBeenCalledTimes(2);

		newResponse.resolve(amap('New'));
		await expect(current).resolves.toMatchObject([{ name: 'New' }]);
		oldResponse.resolve(amap('Old'));
		await expect(old).resolves.toEqual([]);
	});

	it('a cached answer also cancels an in-flight response', async () => {
		const oldResponse = deferred<RequestUrlResponse>();
		const request = vi
			.spyOn(obsidian, 'requestUrl')
			.mockResolvedValueOnce(amap('Cached'))
			.mockImplementationOnce(() => oldResponse.promise as never);
		const search = modal();

		const seed = search.getSuggestions('cached place');
		await vi.advanceTimersByTimeAsync(QUIET_MS);
		await expect(seed).resolves.toMatchObject([{ name: 'Cached' }]);

		const old = search.getSuggestions('old place');
		await vi.advanceTimersByTimeAsync(QUIET_MS);
		await expect(search.getSuggestions('cached place')).resolves.toMatchObject([{ name: 'Cached' }]);
		oldResponse.resolve(amap('Old'));
		await expect(old).resolves.toEqual([]);
		expect(request).toHaveBeenCalledTimes(2);
	});

	it('starts Nominatim requests no faster than once per second across modal instances', async () => {
		const request = vi
			.spyOn(obsidian, 'requestUrl')
			.mockResolvedValueOnce(nominatim('First'))
			.mockResolvedValueOnce(nominatim('Second'));
		const firstModal = modal('nominatim');

		const first = firstModal.getSuggestions('first place');
		await vi.advanceTimersByTimeAsync(QUIET_MS);
		await first;

		// Closing and reopening the UI constructs another modal; the provider's
		// interval must not reset with it.
		const secondModal = modal('nominatim');
		const second = secondModal.getSuggestions('second place');
		await vi.advanceTimersByTimeAsync(NOMINATIM_INTERVAL_MS - 1);
		expect(request).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		await second;
		expect(request).toHaveBeenCalledTimes(2);
	});
});
