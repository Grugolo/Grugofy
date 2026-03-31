// ─── DRAW ─────────────────────────────────────────────────────────────────────
export const DRAW = {
    play:  '<div style="width:0;height:0;border-left:18px solid #000;border-top:12px solid transparent;border-bottom:12px solid transparent;margin-left:5px;"></div>',
    pause: '<div style="display:flex;gap:6px;"><div style="width:6px;height:22px;background:#000;border-radius:2px;"></div><div style="width:6px;height:22px;background:#000;border-radius:2px;"></div></div>',
    next:  '<div style="display:flex;align-items:center;"><div style="width:0;height:0;border-left:12px solid #fff;border-top:8px solid transparent;border-bottom:8px solid transparent;"></div><div style="width:3px;height:16px;background:#fff;border-radius:1px;"></div></div>',
    prev:  '<div style="display:flex;align-items:center;"><div style="width:3px;height:16px;background:#fff;border-radius:1px;"></div><div style="width:0;height:0;border-right:12px solid #fff;border-top:8px solid transparent;border-bottom:8px solid transparent;"></div></div>',

    loop: (active) => `<div style="width:20px;height:14px;border:2px solid ${active ? '#1db954' : '#888'};border-radius:4px;position:relative;">
        <div style="position:absolute;top:-5px;right:5px;width:5px;height:9px;border-left:6px solid ${active ? '#1db954' : '#888'};border-top:3px solid transparent;border-bottom:3px solid transparent;transform:rotate(-180deg);"></div>
    </div>`,

    shuffle: (active) => `<div style="width:24px;height:18px;position:relative;display:flex;align-items:center;">
        <div style="position:absolute;width:100%;height:100%;">
            <svg viewBox="0 0 24 18" style="fill:none;stroke:${active ? '#1db954' : '#888'};stroke-width:2;stroke-linecap:round;">
                <path d="M2,14 L6,14 C9,14 11,4 14,4 L20,4"/>
                <path d="M2,4 L6,4 C9,4 11,14 14,14 L20,14"/>
            </svg>
            <div style="position:absolute;top:1px;right:0;width:0;height:0;border-left:5px solid ${active ? '#1db954' : '#888'};border-top:3px solid transparent;border-bottom:3px solid transparent;"></div>
            <div style="position:absolute;bottom:1px;right:0;width:0;height:0;border-left:5px solid ${active ? '#1db954' : '#888'};border-top:3px solid transparent;border-bottom:3px solid transparent;"></div>
        </div>
    </div>`,

    up:   '<div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:10px solid #1db954;"></div>',
    down: '<div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid #1db954;"></div>',
    x:    '<div style="position:relative;width:16px;height:16px;"><div style="position:absolute;top:7px;left:0;width:16px;height:2px;background:#ff4444;transform:rotate(45deg);"></div><div style="position:absolute;top:7px;left:0;width:16px;height:2px;background:#ff4444;transform:rotate(-45deg);"></div></div>',
};
