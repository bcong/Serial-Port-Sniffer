import { readdir, rm } from "fs/promises";
import { join } from "path";

// en-US + ko 만 남기고 나머지 로케일 제거 (~40 MB 절약)
const KEEP_LOCALES = new Set(["en-US.pak", "ko.pak"]);

// 시리얼 모니터 앱에서 사용하지 않는 파일 제거
// - dxcompiler.dll / dxil.dll : WebGPU DirectX 셰이더 컴파일러 (~26 MB)
// - vk_swiftshader.dll / vulkan-1.dll / vk_swiftshader_icd.json : Vulkan 소프트 렌더러 (~6 MB)
// - ffmpeg.dll : HTML5 미디어 디코더 (~3 MB)
const REMOVE_FILES = new Set([
    "dxcompiler.dll",
    "dxil.dll",
    "vk_swiftshader.dll",
    "vk_swiftshader_icd.json",
    "vulkan-1.dll",
    "ffmpeg.dll",
]);

export default async function afterPack({ appOutDir }) {
    // 1) 로케일 정리
    const localesDir = join(appOutDir, "locales");
    let localeFiles = [];
    try {
        localeFiles = await readdir(localesDir);
    } catch {
        // 로케일 폴더 없으면 무시
    }

    const removeLocales = localeFiles.filter((f) => f.endsWith(".pak") && !KEEP_LOCALES.has(f));
    await Promise.all(removeLocales.map((f) => rm(join(localesDir, f))));
    console.log(`[afterPack] 로케일 ${removeLocales.length}개 제거`);

    // 2) 불필요한 DLL / 파일 제거
    let removed = 0;
    await Promise.all(
        [...REMOVE_FILES].map(async (f) => {
            try {
                await rm(join(appOutDir, f));
                removed++;
            } catch {
                // 파일이 없으면 무시
            }
        }),
    );
    console.log(`[afterPack] 불필요 파일 ${removed}개 제거`);
}
