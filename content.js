/**
 * Google QR SMS Auto - Content Script
 * 借鉴与改编自: https://github.com/havenicec/google-qr-sms-helper (MIT License, Copyright (c) 2026 havenicec)
 * 新增特性: Console 页面自动唤起 Verify -> 二维码页自动检测并注入 [3,null,4] -> 选择页自动勾选短信并弹出手机号输入框
 */
(() => {
  const isCloudConsole = location.hostname === "console.cloud.google.com";
  const isQrPage = location.pathname.includes("/challenge/iap/qrcode");
  const isSelectionPage = location.pathname.includes("/uplevelingstep/selection") || location.pathname.includes("/challenge/iap");

  if (!isCloudConsole && !isQrPage && !isSelectionPage) {
    return;
  }

  // 创建右下角悬浮状态面板
  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;background:linear-gradient(135deg,#1a73e8,#1557b0);color:#fff;padding:14px 16px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,0.3);font-family:system-ui,-apple-system,sans-serif;font-size:13px;display:flex;flex-direction:column;gap:8px;min-width:260px;max-width:340px;";

  const title = document.createElement("div");
  title.style.cssText = "font-weight:700;font-size:14px;display:flex;justify-content:space-between;align-items:center;";
  title.textContent = "⚡ Google 一键自动短信验证 v2.0";
  panel.appendChild(title);

  const statusEl = document.createElement("div");
  statusEl.style.cssText = "font-size:12px;color:#e8f0fe;word-break:break-word;line-height:1.45;";
  panel.appendChild(statusEl);

  const btn = document.createElement("button");
  btn.style.cssText = "background:#fff;color:#1a73e8;border:none;padding:8px 12px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;transition:opacity 0.2s;";
  panel.appendChild(btn);

  document.body.appendChild(panel);

  // ==================== 1. Google Cloud Console 页面全自动唤起 Verify ====================
  if (isCloudConsole) {
    let shellClicked = false;
    let verifyClicked = false;
    const hasCloudShellParam = location.search.includes("cloudshell=true");

    statusEl.textContent = "🔄 正在自动检测并唤起 Cloud Shell Verify 验证弹窗...";
    btn.textContent = "手动重新触发 Cloud Shell Verify";

    function findVerifyButton() {
      const candidates = Array.from(document.querySelectorAll("button, a, [role='button']"));
      for (const el of candidates) {
        const txt = (el.textContent || "").trim();
        if (
          txt === "Verify" ||
          txt === "验证" ||
          txt === "Verify account" ||
          txt === "验证账号"
        ) {
          return el;
        }
      }
      return null;
    }

    function findCloudShellButton() {
      return document.querySelector(
        'button[aria-label*="Cloud Shell"], button[mattooltip*="Cloud Shell"], [id*="cloudshell-toggle"], [data-prober*="cloudshell"], button[aria-label*="激活 Cloud Shell"], button[aria-label*="Activate Cloud Shell"]'
      );
    }

    function tryTriggerConsoleVerify(forceClickShell = false) {
      // 1. 优先检查底部/弹窗是否已经出现了 Verify 按钮
      const verifyBtn = findVerifyButton();
      if (verifyBtn && !verifyClicked) {
        verifyClicked = true;
        statusEl.textContent = "✅ 已检测到 Verify 按钮，正在自动点击进入验证...";
        verifyBtn.click();
        return true;
      }

      // 2. 如果 URL 没有 cloudshell=true 或者需要点击右上角终端图标
      const shellBtn = findCloudShellButton();
      if (shellBtn && (!shellClicked || forceClickShell) && !hasCloudShellParam) {
        shellClicked = true;
        shellBtn.click();
        statusEl.textContent = "✅ 已自动点击 Cloud Shell 终端图标，等待弹出 Verify 按钮...";
      } else if (shellBtn && forceClickShell) {
        shellClicked = true;
        shellBtn.click();
        statusEl.textContent = "✅ 已点击 Cloud Shell 终端图标，等待弹出 Verify 按钮...";
      }
      return false;
    }

    btn.onclick = () => {
      verifyClicked = false;
      tryTriggerConsoleVerify(true);
    };

    // 轮询自动检测并点击
    const consoleTimer = setInterval(() => {
      if (tryTriggerConsoleVerify(false)) {
        clearInterval(consoleTimer);
      }
    }, 1000);

    // 5 秒后如果通过 cloudshell=true 还没弹出 Verify，主动点一下终端按钮兜底
    setTimeout(() => {
      if (!verifyClicked) {
        tryTriggerConsoleVerify(true);
      }
    }, 5000);
  }

  // ==================== 2. 二维码页面全自动识别 + 注入 [3,null,4] + 跳转 ====================
  else if (isQrPage) {
    let isRunning = false;
    statusEl.textContent = "🔄 正在等待二维码渲染并自动执行 [3,null,4] 短信降级注入...";
    btn.textContent = "⚡ 立即手动降级到短信输入框";
    btn.onclick = () => runDowngrade(true);

    // 自动轮询检测二维码图片，一旦渲染完成立即自动注入
    let retryCount = 0;
    const qrTimer = setInterval(async () => {
      if (isRunning) return;
      retryCount++;
      try {
        const qrUrl = await extractQrUrlFromPage();
        if (qrUrl) {
          isRunning = true;
          clearInterval(qrTimer);
          runDowngrade(false, qrUrl);
        }
      } catch (e) {
        if (retryCount % 3 === 0) {
          statusEl.textContent = `⏳ 正在等待二维码加载 (${retryCount}s)...`;
        }
      }
    }, 900);
  }

  // ==================== 3. 验证方式选择页 (/uplevelingstep/selection) 自动勾选短信并弹出手机号输入框 ====================
  else if (isSelectionPage) {
    let optionSelected = false;
    statusEl.textContent = "🔄 已进入短信验证页，正在自动选择「短信 (Text message)」以弹出手机号输入框...";
    btn.textContent = "自动勾选短信并下一步";

    function autoSelectSmsAndNext() {
      // 如果页面上已经出现了手机号输入框 (input[type="tel"])，说明已经弹出短信输入框，停止自动操作并自动聚焦
      const phoneInput = document.querySelector('input[type="tel"], input[autocomplete="tel"], input[name*="phone" i], input[id*="phone" i]');
      if (phoneInput && phoneInput.offsetParent !== null) {
        statusEl.textContent = "🎉 已成功弹出短信手机号输入框！请输入手机号获取 6 位验证码。";
        btn.style.display = "none";
        phoneInput.focus();
        return true;
      }

      if (optionSelected) return false;

      // 查找短信单选框 (Text message / SMS / 短信)
      const radios = Array.from(document.querySelectorAll('input[type="radio"], [role="radio"], [data-value]'));
      let smsTarget = null;

      for (const r of radios) {
        const containerText = (r.closest("label, li, div[ jsaction ], div")?.textContent || r.getAttribute("aria-label") || "").toLowerCase();
        if (
          containerText.includes("text message") ||
          containerText.includes("sms") ||
          containerText.includes("短信") ||
          containerText.includes("文字訊息")
        ) {
          smsTarget = r;
          break;
        }
      }

      // 如果没通过文本匹配找到，默认选第一项（即 Text message）
      if (!smsTarget && radios.length > 0) {
        smsTarget = radios[0];
      }

      if (smsTarget) {
        optionSelected = true;
        smsTarget.click();
        const parentLabel = smsTarget.closest("label, [role='radio']");
        if (parentLabel && parentLabel !== smsTarget) {
          parentLabel.click();
        }
        statusEl.textContent = "✅ 已自动勾选「短信 (SMS)」，正在自动点击下一步弹出手机号输入框...";

        setTimeout(() => {
          const allBtns = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'));
          const nextBtn = allBtns.find(b => {
            const t = (b.textContent || b.value || "").trim().toLowerCase();
            return t === "next" || t === "下一步" || t === "继续" || t === "continue" || t === "send" || t === "发送";
          });
          if (nextBtn) {
            nextBtn.click();
          }
        }, 600);
      }
      return false;
    }

    btn.onclick = () => {
      optionSelected = false;
      autoSelectSmsAndNext();
    };

    const selTimer = setInterval(() => {
      if (autoSelectSmsAndNext()) {
        clearInterval(selTimer);
      }
    }, 800);
  }

  // ==================== 辅助函数：提取页面二维码 & 后台注入 ====================
  async function extractQrUrlFromPage() {
    if ("BarcodeDetector" in window) {
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      const mediaEls = Array.from(document.querySelectorAll("img, canvas"));
      for (const el of mediaEls) {
        try {
          if (el.clientWidth > 80 && el.clientHeight > 80) {
            const c = document.createElement("canvas");
            c.width = el.naturalWidth || el.clientWidth || 300;
            c.height = el.naturalHeight || el.clientHeight || 300;
            const ctx = c.getContext("2d");
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(el, 0, 0, c.width, c.height);
            const codes = await detector.detect(c);
            if (codes && codes.length > 0 && codes[0].rawValue) {
              return codes[0].rawValue;
            }
          }
        } catch (e) {}
      }
    }
    const bodyText = document.body.innerText || "";
    const shortMatch = bodyText.match(/g\.co\/verify\/[A-Za-z0-9_-]+/);
    if (shortMatch) {
      return "https://" + shortMatch[0];
    }
    const html = document.documentElement.innerHTML;
    const m = html.match(/https:\/\/accounts\.google\.com\/devicephoneverification\/begin\?[^"'\s<>]+/);
    if (m) return m[0].replace(/\\u003d/g, "=").replace(/\\u0026/g, "&");
    throw new Error("未能在当前页面识别到二维码，请确认二维码图片已加载");
  }

  async function runDowngrade(isManual = false, preExtractedUrl = null) {
    try {
      btn.disabled = true;
      btn.textContent = "正在识别二维码并注入...";
      const qrUrl = preExtractedUrl || (await extractQrUrlFromPage());
      statusEl.textContent = "✅ 已识别二维码，正在后台注入 [3,null,4] 降级状态...";

      const res = await chrome.runtime.sendMessage({ action: "downgradeQr", qrUrl });
      if (!res || !res.ok) {
        throw new Error(res ? res.error : "后台请求失败");
      }
      if (!res.ydResp.includes("[3,null,4]")) {
        statusEl.textContent = "⚠️ 服务端返回: " + res.ydResp.slice(0, 80);
        btn.disabled = false;
        btn.textContent = "重试一键降级";
        return;
      }

      statusEl.textContent = "✅ [3,null,4] 注入成功！正在跳转并弹出短信输入框...";
      const params = new URLSearchParams(location.search);
      let cont = params.get("continue") || "";
      let targetUrl = "";

      if (cont && cont.startsWith("https://accounts.google.com/uplevelingstep/")) {
        cont = cont.replace(/&idv_xdevice=[^&]*/g, "");
        cont = cont.replace(/([?&])authuser(&|$)/, "$1authuser=0$2");
        targetUrl = cont + "&idv_xdevice=1";
      } else {
        targetUrl = location.href.replace("/challenge/iap/qrcode", "/challenge/iap");
        targetUrl = targetUrl.replace(/&idv_xdevice=[^&]*/g, "") + "&idv_xdevice=1";
      }
      location.replace(targetUrl);
    } catch (e) {
      statusEl.textContent = "❌ " + e.message;
      btn.disabled = false;
      btn.textContent = "重试一键降级";
    }
  }
})();
