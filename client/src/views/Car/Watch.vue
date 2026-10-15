<template>
    <section class="car-view" :class="{ 'car-view--fullscreen': controls?.menuVisible === false, 'car-view--idle': controls?.menuAutoHidden }"
        aria-label="KomenoTV 車載テレビ" @pointerdown="controls?.activity()">
        <video ref="video" class="car-video" playsinline autoplay
            @playing="player?.playing()" @waiting="player?.waiting()" />
        <button class="car-video-button" tabindex="-1" aria-label="全画面で表示" @click="enterFullscreen"></button>
        <header class="car-header">
            <h1>KomenoTV</h1><span>480p・HEVC</span>
            <span class="car-header__hint">回す: 選局 / 押す: 全画面 / 戻る: メニュー</span>
        </header>
        <div v-if="status" class="car-status" role="status">
            <p>{{ status }}</p>
            <button v-if="retryAvailable" @click="retryPlayback">再試行</button>
        </div>
        <div v-if="controls && controls.selectedIndex !== controls.activeIndex" class="car-candidate" role="status">
            切替予定：{{ selectedChannel?.name }}
        </div>
        <nav class="car-menu" aria-label="チャンネル選択">
            <div class="car-program">
                <strong>{{ selectedChannel?.name ?? 'チャンネルを取得中…' }}</strong>
                <span v-if="selectedChannel?.program_present"
                    v-html="ProgramUtils.decorateProgramInfo(selectedChannel.program_present, 'title')"></span>
            </div>
            <div ref="channelList" class="car-channels">
                <button v-for="(channel, index) in channels" :key="channel.display_channel_id"
                    :class="{ 'is-selected': index === controls?.selectedIndex }"
                    :aria-current="index === controls?.activeIndex ? 'true' : undefined"
                    @focus="controls?.select(index)" @click="enterFullscreen">
                    <span>{{ channel.channel_number }}</span>{{ channel.name }}
                </button>
            </div>
        </nav>
    </section>
</template>
<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowReactive, shallowRef, watch } from 'vue';

import Channels, { ILiveChannel } from '@/services/Channels';
import CarPlayer from '@/services/player/CarPlayer';
import useSettingsStore from '@/stores/SettingsStore';
import { CarControls } from '@/utils/CarControls';
import { ProgramUtils } from '@/utils/ProgramUtils';

const video = ref<HTMLVideoElement | null>(null);
const channelList = ref<HTMLDivElement | null>(null);
const channels = ref<ILiveChannel[]>([]);
const controls = shallowRef<CarControls | null>(null);
const status = ref('チャンネルを取得しています…');
const retryAvailable = ref(false);
const settings = useSettingsStore();
const selectedChannel = computed(() => channels.value[controls.value?.selectedIndex ?? -1]);
let player: CarPlayer | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let menuHistory = false;
let disposed = false;

function playChannel(channelId: string): void {
    settings.settings.car_last_channel_id = channelId;
    if (!document.hidden) player?.start(channelId);
}

async function focusSelected(): Promise<void> {
    await nextTick();
    const button = channelList.value?.children[controls.value?.selectedIndex ?? -1] as HTMLButtonElement | undefined;
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// 自動非表示でもWebViewの「戻る」がページ退出にならないよう、履歴は一段だけ作る。
function preserveMenuHistory(): void {
    if (menuHistory) return;
    history.pushState({ komenoMenu: true }, '', location.href);
    menuHistory = true;
}

watch(() => controls.value?.menuAutoHidden, hidden => {
    if (hidden) preserveMenuHistory();
});

function enterFullscreen(): void {
    if (!controls.value) return;
    preserveMenuHistory();

    controls.value.confirm();
    player?.resume();
}

function showMenu(): void {
    controls.value?.back();
    focusSelected();
}

function onPopState(): void {
    menuHistory = false;
    showMenu();
}

function onKey(event: KeyboardEvent): void {
    const direction = ['ArrowRight', 'ArrowDown', 'PageDown'].includes(event.key) || (event.key === 'Tab' && !event.shiftKey) ? 1 :
        ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key) || (event.key === 'Tab' && event.shiftKey) ? -1 : 0;
    if (direction) {
        event.preventDefault();
        event.stopPropagation();
        controls.value?.move(direction);
        focusSelected();
    } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        enterFullscreen();
    } else if (['Escape', 'BrowserBack', 'Backspace'].includes(event.key) && controls.value && (!controls.value.menuVisible || controls.value.menuAutoHidden)) {
        event.preventDefault();
        showMenu();
        if (menuHistory) history.back();
    }
}

function onWheel(event: WheelEvent): void {
    const delta = event.deltaY || event.deltaX;
    if (!delta) return;
    event.preventDefault();
    controls.value?.move(Math.sign(delta));
    focusSelected();
}

function retryPlayback(): void {
    const id = controls.value?.activeChannelId;
    if (id) playChannel(id);
    else location.reload();
}

function onVisibility(): void {
    if (document.hidden) {
        controls.value?.cancel();
        player?.stop();
    } else {
        controls.value?.activity();
        retryPlayback();
    }
}

onMounted(async () => {
    document.title = 'KomenoTV';
    // 車載オリジンは家庭用のアカウント設定と同期しない。
    settings.settings.sync_settings = false;
    player = new CarPlayer(video.value!, (message, retry) => {
        status.value = message;
        retryAvailable.value = retry;
    });
    const result = await Channels.fetchAllChannels();
    if (disposed) return;
    if (result === null) {
        status.value = 'チャンネル情報を取得できません。接続を確認して再試行してください。';
        retryAvailable.value = true;
        return;
    }
    channels.value = Object.values(result).flat().filter(channel => channel.is_display && !channel.is_subchannel && !channel.is_radiochannel);
    if (channels.value.length === 0) {
        status.value = '視聴できるチャンネルがありません。';
        return;
    }
    controls.value = shallowReactive(new CarControls(channels.value.map(channel => channel.display_channel_id),
        settings.settings.car_last_channel_id, playChannel));
    controls.value.back();
    focusSelected();
    playChannel(controls.value.activeChannelId!);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('popstate', onPopState);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', retryPlayback);
    // 番組名だけ更新し、視聴中のチャンネル順や選局タイマーを変えない。
    refreshTimer = setInterval(async () => {
        const refreshed = await Channels.fetchAllChannels();
        if (!refreshed || disposed) return;
        const byId = new Map(Object.values(refreshed).flat().map(channel => [channel.display_channel_id, channel]));
        channels.value = channels.value.map(channel => byId.get(channel.display_channel_id) ?? channel);
    }, 30_000);
});

onBeforeUnmount(() => {
    disposed = true;
    controls.value?.dispose();
    player?.stop();
    if (refreshTimer !== null) clearInterval(refreshTimer);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('popstate', onPopState);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', retryPlayback);
});
</script>
<style lang="scss" scoped src="./Watch.scss"></style>