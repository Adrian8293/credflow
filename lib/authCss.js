// Larger, higher-contrast overrides shared by the sign-in, reset-password and invite pages.
// Appended AFTER each page's own CSS so it wins; selectors are prefixed to beat the global input rules.
export const AUTH_READABLE_CSS = `
.pc-box .pc-heading{font-size:28px;line-height:1.15}
.pc-box .pc-sub{font-size:17px;color:#475569}
.pc-box .pc-label{font-size:14px;letter-spacing:.2px;text-transform:none;font-weight:700;color:#334155}
.pc-box .pc-input-wrap input{font-size:18px;min-height:54px;padding:12px 52px 12px 48px;border:2px solid #94A3B8;border-radius:12px}
.pc-box .pc-input-wrap input:focus{border-color:#0B6B7A;box-shadow:0 0 0 4px rgba(11,107,122,.18)}
.pc-box .pc-input-icon{left:15px}
.pc-box .pc-input-icon svg{width:20px;height:20px}
.pc-box .pc-input-right{right:6px}
.pc-box .eye-btn{width:44px;height:44px;justify-content:center;color:#475569}
.pc-box .eye-btn svg{width:22px;height:22px}
.pc-box .pc-forgot{margin-top:-2px}
.pc-box .pc-forgot .pc-link,.pc-box .pc-link{font-size:17px;font-weight:700;text-decoration:underline;padding:8px 0}
.pc-box .pc-submit{font-size:19px;min-height:58px;border-radius:12px}
.pc-box .pc-msg{font-size:16.5px;padding:14px 16px;border-radius:10px;border-left-width:5px}
.pc-box .pc-msg-icon{width:26px;height:26px;font-size:15px}
.pc-box .pc-msg--err{background:#FEF2F2;color:#B91C1C}.pc-box .pc-msg--err .pc-msg-icon{background:#DC2626}
.pc-box .pc-msg--ok{background:#ECFDF5;color:#047857}.pc-box .pc-msg--ok .pc-msg-icon{background:#059669}
.pc-box .pc-trust-item{font-size:13px;color:#475569}
.pc-box .pc-rule{font-size:15px}
.pc-box .pc-strength-label{font-size:14px}
@media(max-width:520px){.pc-box{padding-left:20px!important;padding-right:20px!important}}

.iv-card{max-width:480px}
.iv-card h1{font-size:28px;line-height:1.15}
.iv-card .iv-muted{font-size:17px;color:#475569}
.iv-card label{font-size:16px;font-weight:700}
.iv-card input[type=text],.iv-card input[type=password],.iv-card input:not([type]){font-size:18px;min-height:54px;padding:12px;border:2px solid #94A3B8;border-radius:12px}
.iv-card .iv-check{font-size:17px;padding:6px 0}.iv-card .iv-check input{width:24px;height:24px}
.iv-card .iv-hint{font-size:15px;color:#475569}
.iv-card .iv-error{font-size:16.5px;padding:14px 16px;border-width:2px;font-weight:600}
.iv-card .iv-btn{font-size:19px;min-height:58px;border-radius:12px}
.iv-card .iv-link{font-size:17px;text-decoration:underline}
`
