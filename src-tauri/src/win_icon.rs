//! Windows-only: set a window's ICON_BIG (the taskbar / Alt-Tab icon).
//!
//! Tauri's `Window::set_icon` maps to tao's `set_window_icon`, which only updates
//! ICON_SMALL (the title-bar icon). The taskbar button uses ICON_BIG, which tao
//! exposes via a separate `set_taskbar_icon` that Tauri does not surface. So we
//! set ICON_BIG ourselves from the same RGBA, keeping the taskbar in sync with
//! the live theme.

use std::sync::Mutex;

use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::Graphics::Gdi::{
    CreateBitmap, CreateDIBSection, DeleteObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    DIB_RGB_COLORS, HGDIOBJ,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateIconIndirect, DestroyIcon, SendMessageW, HICON, ICONINFO, ICON_BIG, WM_SETICON,
};

/// The last big icon we installed, kept so we can free it when a new theme
/// replaces it (the window holds the handle; we own its lifetime). 0 = none.
static LAST_BIG_ICON: Mutex<isize> = Mutex::new(0);

/// Reorder canvas RGBA into the BGRA byte order a Windows 32bpp DIB expects.
pub fn rgba_to_bgra(rgba: &[u8]) -> Vec<u8> {
    let mut out = rgba.to_vec();
    for px in out.chunks_exact_mut(4) {
        px.swap(0, 2); // R <-> B; G and A stay put
    }
    out
}

/// Build an HICON from `rgba` (width*height*4 bytes, canvas order) and assign it
/// as `hwnd`'s ICON_BIG. Frees the previously-installed big icon.
pub fn set_big_icon(hwnd: HWND, rgba: &[u8], width: i32, height: i32) -> Result<(), String> {
    let bgra = rgba_to_bgra(rgba);
    if bgra.len() != (width * height * 4) as usize {
        return Err("rgba length does not match width*height*4".into());
    }

    unsafe {
        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // negative => top-down, matching canvas rows
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
        let hbm_color = CreateDIBSection(None, &bmi, DIB_RGB_COLORS, &mut bits, None, 0)
            .map_err(|e| e.to_string())?;
        if bits.is_null() {
            let _ = DeleteObject(HGDIOBJ(hbm_color.0));
            return Err("CreateDIBSection returned no pixel buffer".into());
        }
        std::ptr::copy_nonoverlapping(bgra.as_ptr(), bits as *mut u8, bgra.len());

        // 1bpp mask; with a 32bpp color bitmap the alpha channel drives
        // transparency, so an all-zero mask is correct.
        let hbm_mask = CreateBitmap(width, height, 1, 1, None);

        let info = ICONINFO {
            fIcon: true.into(),
            xHotspot: 0,
            yHotspot: 0,
            hbmMask: hbm_mask,
            hbmColor: hbm_color,
        };
        let hicon = CreateIconIndirect(&info);
        // CreateIconIndirect copies the bitmaps; release our originals either way.
        let _ = DeleteObject(HGDIOBJ(hbm_color.0));
        let _ = DeleteObject(HGDIOBJ(hbm_mask.0));
        let hicon = hicon.map_err(|e| e.to_string())?;

        SendMessageW(
            hwnd,
            WM_SETICON,
            Some(WPARAM(ICON_BIG as usize)),
            Some(LPARAM(hicon.0 as isize)),
        );

        // Now that the new icon is shown, free the one it replaced.
        let mut last = LAST_BIG_ICON.lock().unwrap();
        if *last != 0 {
            let _ = DestroyIcon(HICON(*last as *mut core::ffi::c_void));
        }
        *last = hicon.0 as isize;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::rgba_to_bgra;

    #[test]
    fn swaps_red_and_blue_channels_only() {
        // two pixels: (R,G,B,A)
        let rgba = [10, 20, 30, 40, 200, 100, 50, 255];
        let bgra = rgba_to_bgra(&rgba);
        assert_eq!(bgra, [30, 20, 10, 40, 50, 100, 200, 255]);
    }
}
