import { dataProvider } from './services/dataProvider.js';
import { preferenceService } from './services/preferenceService.js';
import { familyService } from './services/familyService.js';
export const APP_VERSION = '2.12';
/**
 * 微信云开发环境 ID 配置
 * 若您在微信开发者工具或微信公众平台开通了云开发，可在此填写具体环境 ID (如 'cloud1-xxx')；
 * 若未开通或留空，系统启动时将尝试连接默认环境，遇到环境缺失 (-601034) 将自动无缝降级至本地高可用容灾模式。
 */
export const CLOUD_ENV_ID = 'cloudbase-d8gsg70x9e12e0074';
App({
    globalData: {
        currentMenu: null,
        version: APP_VERSION,
    },
    onLaunch() {
        console.log(`《四季三餐·好好吃饭》小程序 V${APP_VERSION} 启动中...`);
        // 微信原生云开发环境合规安全初始化
        if (typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.init === 'function') {
            try {
                const initOptions = { traceUser: true };
                if (CLOUD_ENV_ID) {
                    initOptions.env = CLOUD_ENV_ID;
                }
                wx.cloud.init(initOptions);
            }
            catch (e) {
                console.warn('微信云开发环境初始化异常:', e);
            }
        }
        dataProvider.init();
        preferenceService.getPreferences();
        // 静默鉴权并同步家庭身份
        familyService.syncUserAuth().catch(err => {
            console.warn('静默鉴权同步异常 (离线模式运行):', err);
        });
    }
});
