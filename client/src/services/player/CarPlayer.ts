import mpegts from 'mpegts.js';

import Utils from '@/utils';

/** 車載画面の単一ライブ接続を管理し、局変更・非表示時に必ず旧接続を解放する。 */
export default class CarPlayer {
    private player: mpegts.Player | null = null;
    private generation = 0;
    private channelId: string | null = null;

    constructor(
        private readonly video: HTMLVideoElement,
        private readonly report: (message: string, retry: boolean) => void,
    ) {}

    async start(channelId: string): Promise<void> {
        this.stop();
        this.channelId = channelId;
        const generation = this.generation;
        // HEVC が使えない環境では、画質・コーデックを黙って変更しない。
        if (!mpegts.getFeatureList().mseH265Playback) {
            this.report('この環境ではHEVCを再生できません。対応するFermata／ブラウザで開いてください。', false);
            return;
        }
        this.report('チューナーに接続しています…', false);
        try {
            const workerSupported = await mpegts.supportWorkerForMSEH265Playback();
            // 能力判定中に局が変わったり画面を閉じた場合、古い処理から接続しない。
            if (generation !== this.generation) return;
            const player = mpegts.createPlayer({
                type: 'mpegts',
                isLive: true,
                url: `${Utils.api_base_url}/streams/live/${encodeURIComponent(channelId)}/480p-hevc/mpegts`,
            }, {
                enableWorker: true,
                enableWorkerForMSE: workerSupported,
                autoCleanupSourceBuffer: true,
                // 通信復旧後に遅延が積み上がらないよう、ライブの再生位置を追従させる。
                liveBufferLatencyChasing: true,
                liveBufferLatencyMaxLatency: 3,
                liveBufferLatencyMinRemain: 1,
            });
            this.player = player;
            player.on(mpegts.Events.ERROR, (type: string, detail: string) => {
                if (generation !== this.generation) return;
                console.error('[KomenoTV] Playback error:', type, detail);
                this.stop();
                this.report('配信に接続できませんでした。接続を確認して再試行してください。', true);
            });
            player.attachMediaElement(this.video);
            player.load();
            await this.video.play().catch(() => {
                if (generation === this.generation) this.report('押し込みで再生を開始します。', true);
            });
        } catch (error) {
            if (generation !== this.generation) return;
            console.error('[KomenoTV] Failed to initialize playback:', error);
            this.stop();
            this.report('再生を開始できませんでした。再試行してください。', true);
        }
    }

    resume(): void {
        if (this.player === null) {
            if (this.channelId !== null) this.start(this.channelId);
            return;
        }
        const generation = this.generation;
        // ユーザーの押し込み操作と同じ呼び出し内で、音声付き自動再生の制限を解除する。
        this.video.play().catch(() => {
            if (generation === this.generation) this.report('再生を開始できませんでした。再試行してください。', true);
        });
    }

    playing(): void {
        if (this.player !== null) this.report('', false);
    }

    waiting(): void {
        if (this.player !== null && !this.video.paused) this.report('受信しています…', false);
    }

    stop(): void {
        this.generation++;
        this.player?.destroy();
        this.player = null;
        this.video.pause();
        this.video.removeAttribute('src');
        this.video.load();
    }
}