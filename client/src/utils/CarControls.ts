const MENU_IDLE_MS = 5_000;

/** 回転は候補だけを動かし、押し込みで確定する車載用の選局状態。 */
export class CarControls {
    selectedIndex: number;
    activeIndex: number;
    menuVisible = false;
    private menuTimer: ReturnType<typeof setTimeout> | null = null;
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
        if (this.disposed || this.channelIds.length === 0 || direction === 0) return;
        this.menuVisible = true;
        // 実車の回転方向に合わせ、従来とは逆向きに候補を動かす。
        this.select((this.selectedIndex - Math.sign(direction) + this.channelIds.length) % this.channelIds.length);
        if (this.menuTimer !== null) clearTimeout(this.menuTimer);
        this.menuTimer = setTimeout(() => this.cancel(), MENU_IDLE_MS);
    }

    select(index: number): void {
        if (this.disposed || !this.menuVisible || !Number.isInteger(index) || index < 0 || index >= this.channelIds.length) return;
        this.selectedIndex = index;
    }

    /** 新しい局を確定した時だけtrue。同じ局なら呼び出し側で再生・停止を切り替える。 */
    confirm(): boolean {
        if (this.disposed || this.activeChannelId === null) return false;
        const changed = this.menuVisible && this.selectedIndex !== this.activeIndex;
        if (changed) this.activeIndex = this.selectedIndex;
        this.cancel();
        if (changed) this.onCommit(this.activeChannelId!);
        return changed;
    }

    cancel(): void {
        if (this.menuTimer !== null) clearTimeout(this.menuTimer);
        this.menuTimer = null;
        this.menuVisible = false;
        // 隠れた未確定候補を、次の押し込みで誤って選局しない。
        this.selectedIndex = this.activeIndex;
    }

    dispose(): void {
        this.cancel();
        this.disposed = true;
    }
}
