"""GUI entrypoint; surface startup errors even when launched with pythonw."""
import traceback
import sys
from pathlib import Path

if __name__ == "__main__":
    try:
        from controller import main
        main()
    except Exception:
        path = Path(__file__).parent / "startup-error.log"
        path.write_text(traceback.format_exc(), encoding="utf-8")
        if '--background' in sys.argv:
            sys.exit(1)
        import tkinter as tk
        from tkinter import messagebox
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Q36 控制器启动失败", f"详情已保存到 {path}")
        root.destroy()
