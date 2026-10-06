/**
 * 图像加载与双轨容灾服务 (ImageService)
 * 职责：
 * 1. 本地高兼容打包主轨 (/assets/dishes/*.jpg)
 * 2. 云端 CDN 双轨容灾 (jsDelivr / GitHub Raw)
 * 3. 类别默认大图兜底 (/assets/dishes/default_*.jpg)
 * 4. 内存级 SVG DataURI 微缩兜底 (0网络0文件白屏防御)
 */
export const CDN_HOSTS = [
    'https://cdn.jsdelivr.net/gh/pi-niuniu/three-dishes-and-soup@main/miniprogram',
    'https://raw.githubusercontent.com/pi-niuniu/three-dishes-and-soup/main/miniprogram'
];
export const CATEGORY_DEFAULT_IMAGES = {
    main_meat: '/assets/dishes/default_main.jpg',
    secondary_meat: '/assets/dishes/default_secondary.jpg',
    vegetable: '/assets/dishes/default_vegetable.jpg',
    soup: '/assets/dishes/default_soup.jpg',
    egg: '/assets/dishes/default_egg.jpg',
    tofu: '/assets/dishes/default_tofu.jpg',
    staple_sauce: '/assets/dishes/default_dish.jpg',
    default: '/assets/dishes/default_dish.jpg'
};
function createSvgDataUri(emoji, title, badgeBg = '#F7F4EE') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" width="220" height="220">` +
        `<rect width="220" height="220" fill="${badgeBg}"/>` +
        `<circle cx="110" cy="110" r="90" fill="#FFFDF8" stroke="#E6DFD3" stroke-width="2"/>` +
        `<circle cx="110" cy="110" r="80" fill="none" stroke="#E6DFD3" stroke-width="1" stroke-dasharray="4,4"/>` +
        `<text x="110" y="98" font-size="52" text-anchor="middle" dominant-baseline="central">${emoji}</text>` +
        `<text x="110" y="152" font-size="15" font-family="-apple-system,BlinkMacSystemFont,PingFang SC,sans-serif" font-weight="600" fill="#6B655B" text-anchor="middle">${title}</text>` +
        `</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
export const CATEGORY_SVG_DATA_URIS = {
    main_meat: createSvgDataUri('🥩', '精选大荤'),
    secondary_meat: createSvgDataUri('🍳', '鲜香小炒'),
    vegetable: createSvgDataUri('🥬', '碧绿时蔬'),
    soup: createSvgDataUri('🍲', '滋润靓汤'),
    egg: createSvgDataUri('🥚', '家常蛋品'),
    tofu: createSvgDataUri('🥢', '豆香适口'),
    staple_sauce: createSvgDataUri('🍚', '饱腹主食'),
    default: createSvgDataUri('🍽️', '四季三餐')
};
export class ImageService {
    /**
     * 获取指定图片的 CDN 容灾完整链接
     */
    getCdnUrl(localPath, hostIndex = 0) {
        if (!localPath)
            return '';
        const cleanPath = localPath.startsWith('/') ? localPath : `/${localPath}`;
        const host = CDN_HOSTS[hostIndex] || CDN_HOSTS[0];
        const remotePath = cleanPath.replace(/\.(jpg|jpeg)$/i, '.webp');
        return `${host}${remotePath}`;
    }
    /**
     * 获取分类默认大图路径
     */
    getDefaultImage(category) {
        if (!category)
            return CATEGORY_DEFAULT_IMAGES.default;
        return CATEGORY_DEFAULT_IMAGES[category] || CATEGORY_DEFAULT_IMAGES.default;
    }
    /**
     * 获取内存级 SVG 兜底 Data URI
     */
    getSvgFallback(category) {
        if (!category)
            return CATEGORY_SVG_DATA_URIS.default;
        return CATEGORY_SVG_DATA_URIS[category] || CATEGORY_SVG_DATA_URIS.default;
    }
    /**
     * 状态机：计算下一个降级容灾图片 URL
     * 降级序列：
     * 1. 本地菜品 JPG (/assets/dishes/dish_xxx.jpg)
     *    -> 一级 CDN (jsDelivr, 映射为远端真实 .webp 资产)
     * 2. 一级 CDN
     *    -> 二级 CDN (GitHub Raw, 映射为远端真实 .webp 资产)
     * 3. 二级 CDN 或其他外部地址
     *    -> 本地类别默认大图 (/assets/dishes/default_xxx.jpg)
     * 4. 本地类别默认大图
     *    -> 内存级无网络 SVG Data URI
     * 5. SVG Data URI
     *    -> 保持终止态，绝不发生死循环
     */
    getNextFallbackUrl(currentSrc, category) {
        if (!currentSrc) {
            return this.getDefaultImage(category);
        }
        // 终止态：如果是 SVG Data URI，直接返回
        if (currentSrc.startsWith('data:image')) {
            return currentSrc;
        }
        // 1. 如果已是二级 CDN (GitHub Raw)
        if (currentSrc.startsWith(CDN_HOSTS[1])) {
            return this.getDefaultImage(category);
        }
        // 2. 如果是一级 CDN (jsDelivr)
        if (currentSrc.startsWith(CDN_HOSTS[0])) {
            const relPath = currentSrc.substring(CDN_HOSTS[0].length);
            return `${CDN_HOSTS[1]}${relPath}`;
        }
        // 3. 如果是其他外部链接
        if (currentSrc.startsWith('http://') || currentSrc.startsWith('https://')) {
            return this.getDefaultImage(category);
        }
        // 4. 如果是本地默认图 default_xxx.jpg
        if (currentSrc.includes('default_')) {
            return this.getSvgFallback(category);
        }
        // 5. 如果是本地菜品大图 dish_xxx.jpg
        // 注意：远端 Git 归档仓库真实资产为标准 .webp 格式，需准确转换为 .webp 才能在 CDN 成功命中 200
        if (currentSrc.includes('dish_')) {
            const cleanPath = currentSrc.startsWith('/') ? currentSrc : `/${currentSrc}`;
            const remotePath = cleanPath.replace(/\.(jpg|jpeg)$/i, '.webp');
            return `${CDN_HOSTS[0]}${remotePath}`;
        }
        // 6. 其他未知格式，降级到默认图
        return this.getDefaultImage(category);
    }
}
export const imageService = new ImageService();
