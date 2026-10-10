import ctypes
import unittest
from native_wheel import Input, screen_point


class WheelTests(unittest.TestCase):
    def test_client_toolbar_offset_and_zoom_mapping(self):
        # 1200x900 browser client, 1200x800 content: toolbar is 100 pixels.
        self.assertEqual(screen_point(1200,900,10,20,1200,800,824,320),(834,440))
        self.assertEqual(screen_point(1800,1350,10,20,1200,800,824,320),(1246,650))

    def test_negative_monitor_origin(self):
        self.assertEqual(screen_point(1200,900,-1200,0,1200,800,600,400),(-600,500))

    def test_invalid_wheel_point_is_rejected(self):
        with self.assertRaises(ValueError):
            screen_point(1200,900,0,0,1200,800,1300,400)

    def test_windows_input_struct_has_correct_native_size(self):
        self.assertEqual(ctypes.sizeof(Input),40 if ctypes.sizeof(ctypes.c_void_p)==8 else 28)


if __name__=='__main__':
    unittest.main()
