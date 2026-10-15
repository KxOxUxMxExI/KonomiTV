/** 回転が止まるまで配信を切り替えず、途中の局への不要な接続を防ぐ。 */
export const CHANNEL_SETTLE_MS = 500;
const MENU_IDLE_MS = 5_000;

/** 車載用の選局とメニュー状態。入力元によらず同じ切り替え規則を使う。 */
export class CarControls {
    selectedIndex: number;
    activeIndex: number;
    menuVisible = true;
    menuAutoHidden = false;
    private menuTimer: ReturnType<typeof setTimeout> | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private disposed = false;

    constructor(
        readonly channelIds: string[],
        lastChannelId: string | null,
        private readonly onCommit: (channelId: string) => void,
    ) {
        // 前回の局が削除されていた場合は、最初の視聴可能な局へ戻す。
        const restoredIndex = lastChannelId === null ? -1 : channelIds.indexOf(lastChannelId);
        this.selectedIndex = channelIds.length === 0 ? -1 : Math.max(0, restoredIndex);
        this.activeIndex = this.selectedIndex;
    }

    get selectedChannelId(): string | null {
        return this.channelIds[this.selectedIndex] ?? null;
    }

    get activeChannelId(): string | null {
        return this.channelIds[this.activeIndex] ?? null;
    }

    move(direction: number): void {
        // 空の一覧や破棄後の遅延入力は無視する。
        if (this.channelIds.length === 0 || this.disposed) return;
        this.select((this.selectedIndex + Math.sign(direction) + this.channelIds.length) % this.channelIds.length);
    }

    select(index: number): void {
        // DOM のフォーカスとキー入力のどちらから呼ばれても、範囲外へは進めない。
        if (this.disposed || !Number.isInteger(index) || index < 0 || index >= this.channelIds.length) return;
        this.activity();
        this.selectedIndex = index;
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        if (this.selectedIndex === this.activeIndex) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            this.activeIndex = this.selectedIndex;
            this.onCommit(this.activeChannelId!);
        }, CHANNEL_SETTLE_MS);
    }

    /** 下部一覧だけを自動で隠す。押し込みで選んだ手動全画面は維持する。 */
    activity(): void {
        if (this.disposed) return;
        this.menuAutoHidden = false;
        if (this.menuTimer !== null) clearTimeout(this.menuTimer);
        this.menuTimer = null;
        if (this.menuVisible) {
            this.menuTimer = setTimeout(() => {
                this.menuTimer = null;
                this.menuAutoHidden = true;
            }, MENU_IDLE_MS);
        }
    }

    confirm(): void {
        this.menuVisible = false;
        this.activity();
    }

    back(): void {
        this.menuVisible = true;
        this.activity();
    }

    cancel(): void {
        if (this.menuTimer !== null) clearTimeout(this.menuTimer);
        this.menuTimer = null;
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        this.selectedIndex = this.activeIndex;
    }

    dispose(): void {
        this.cancel();
        this.disposed = true;
    }
}