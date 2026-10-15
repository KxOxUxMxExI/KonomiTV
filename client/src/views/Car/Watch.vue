<template>
    <section class="car-view" :class="{ 'car-view--idle': !controls?.menuVisible }"
        aria-label="KomenoTV 車載テレビ">
        <video ref="video" class="car-video" playsinline autoplay
            @playing="player?.playing()" @waiting="player?.waiting()" />
        <button class="car-video-button" tabindex="-1" aria-label="再生・停止" @click="pressCommander"></button>
        <header class="car-header">
            <h1>KomenoTV</h1><span>480p・HEVC</span>
            <span class="car-header__hint">回す: 候補 / 押す: 決定・再生/停止</span>
        </header>
        <div v-if="status" class="car-status" role="status">
            <p>{{ status }}</p>
            <button v-if="retryAvailable" @click="retryPlayback">再試行</button>
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
                    @click="chooseChannel(index)">
                    <span>{{ channel.channel_number }}</span>{{ channel.name }}
                </button>
            </div>
        </nav>
    </section>
</template>
<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowReactive, shallowRef } from 'vue';

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

function pressCommander(): void {
    if (controls.value && !controls.value.confirm()) player?.toggle();
}

function chooseChannel(index: number): void {
    controls.value?.select(index);
    pressCommander();
}

function onKey(event: KeyboardEvent): void {
    // 回転をTabで送るWebViewにも対応し、戻る・方向キーはブラウザへ渡す。
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === 'Tab') {
        event.preventDefault();
        controls.value?.move(event.shiftKey ? -1 : 1);
        focusSelected();
    } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!event.repeat) pressCommander();
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

function reconnectPlayback(): void {
    // ユーザーが止めた再生は、通信復旧や画面復帰だけでは再開しない。
    if (!player?.isUserStopped) retryPlayback();
}

function onVisibility(): void {
    if (document.hidden) {
        controls.value?.cancel();
        player?.stop();
    } else {
        reconnectPlayback();
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
    playChannel(controls.value.activeChannelId!);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', reconnectPlayback);
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
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', reconnectPlayback);
});
</script>
<style lang="scss" scoped src="./Watch.scss"></style>