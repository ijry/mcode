package uts.sdk.modules.upScanner

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Size
import android.view.View
import android.widget.ImageButton
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class ScanActivity : AppCompatActivity() {

    private lateinit var previewView: PreviewView
    private lateinit var closeButton: ImageButton
    private lateinit var flashButton: ImageButton
    private lateinit var hintText: TextView

    private var cameraProvider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var preview: Preview? = null
    private var imageAnalyzer: ImageAnalysis? = null
    private lateinit var cameraExecutor: ExecutorService

    private var isFlashOn = false
    private var scanTypes: List<String> = listOf("qrCode", "barCode")
    private var autoZoom = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 获取配置参数
        intent.getStringExtra("scanType")?.let {
            scanTypes = it.split(",")
        }
        autoZoom = intent.getBooleanExtra("autoZoom", false)

        setupUI()
        cameraExecutor = Executors.newSingleThreadExecutor()
        startCamera()
    }

    private fun setupUI() {
        // 创建布局
        val layout = android.widget.FrameLayout(this)
        layout.setBackgroundColor(android.graphics.Color.BLACK)

        // 相机预览
        previewView = PreviewView(this)
        previewView.layoutParams = android.widget.FrameLayout.LayoutParams(
            android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
            android.widget.FrameLayout.LayoutParams.MATCH_PARENT
        )
        layout.addView(previewView)

        // 顶部工具栏
        val topBar = android.widget.LinearLayout(this)
        topBar.orientation = android.widget.LinearLayout.HORIZONTAL
        topBar.setPadding(20, 60, 20, 20)
        val topBarParams = android.widget.FrameLayout.LayoutParams(
            android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
            android.widget.FrameLayout.LayoutParams.WRAP_CONTENT
        )
        topBarParams.gravity = android.view.Gravity.TOP
        topBar.layoutParams = topBarParams

        // 关闭按钮
        closeButton = ImageButton(this)
        closeButton.setImageResource(android.R.drawable.ic_menu_close_clear_cancel)
        closeButton.setBackgroundColor(android.graphics.Color.TRANSPARENT)
        closeButton.setOnClickListener {
            setResult(Activity.RESULT_CANCELED)
            finish()
        }
        topBar.addView(closeButton)

        // 空白占位
        val spacer = View(this)
        val spacerParams = android.widget.LinearLayout.LayoutParams(0, 0)
        spacerParams.weight = 1f
        spacer.layoutParams = spacerParams
        topBar.addView(spacer)

        // 闪光灯按钮
        flashButton = ImageButton(this)
        flashButton.setImageResource(android.R.drawable.ic_menu_camera)
        flashButton.setBackgroundColor(android.graphics.Color.TRANSPARENT)
        flashButton.setOnClickListener {
            toggleFlash()
        }
        topBar.addView(flashButton)

        layout.addView(topBar)

        // 底部提示文字
        hintText = TextView(this)
        hintText.text = "将二维码放入框内，即可自动扫描"
        hintText.setTextColor(android.graphics.Color.WHITE)
        hintText.textSize = 14f
        hintText.gravity = android.view.Gravity.CENTER
        val hintParams = android.widget.FrameLayout.LayoutParams(
            android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
            android.widget.FrameLayout.LayoutParams.WRAP_CONTENT
        )
        hintParams.gravity = android.view.Gravity.BOTTOM
        hintParams.bottomMargin = 100
        hintText.layoutParams = hintParams
        layout.addView(hintText)

        setContentView(layout)
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)

        cameraProviderFuture.addListener({
            cameraProvider = cameraProviderFuture.get()
            bindCameraUseCases()
        }, ContextCompat.getMainExecutor(this))
    }

    private fun bindCameraUseCases() {
        val cameraProvider = cameraProvider ?: return

        // 预览
        preview = Preview.Builder()
            .build()
            .also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }

        // 图像分析
        imageAnalyzer = ImageAnalysis.Builder()
            .setTargetResolution(Size(1280, 720))
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
            .also {
                it.setAnalyzer(cameraExecutor, BarcodeAnalyzer { barcodes ->
                    processBarcodes(barcodes)
                })
            }

        // 选择后置摄像头
        val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

        try {
            // 解绑所有用例
            cameraProvider.unbindAll()

            // 绑定用例到相机
            camera = cameraProvider.bindToLifecycle(
                this,
                cameraSelector,
                preview,
                imageAnalyzer
            )

        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun processBarcodes(barcodes: List<Barcode>) {
        if (barcodes.isEmpty()) return

        val barcode = barcodes[0]
        val rawValue = barcode.rawValue ?: return

        // 返回结果
        val resultIntent = Intent()
        resultIntent.putExtra("content", rawValue)
        resultIntent.putExtra("scanType", getBarcodeTypeName(barcode.format))
        setResult(Activity.RESULT_OK, resultIntent)
        finish()
    }

    private fun getBarcodeTypeName(format: Int): String {
        return when (format) {
            Barcode.FORMAT_QR_CODE -> "QR_CODE"
            Barcode.FORMAT_CODE_128 -> "CODE_128"
            Barcode.FORMAT_CODE_39 -> "CODE_39"
            Barcode.FORMAT_CODE_93 -> "CODE_93"
            Barcode.FORMAT_EAN_8 -> "EAN_8"
            Barcode.FORMAT_EAN_13 -> "EAN_13"
            Barcode.FORMAT_UPC_A -> "UPC_A"
            Barcode.FORMAT_UPC_E -> "UPC_E"
            Barcode.FORMAT_PDF417 -> "PDF_417"
            Barcode.FORMAT_DATA_MATRIX -> "DATA_MATRIX"
            else -> "UNKNOWN"
        }
    }

    private fun toggleFlash() {
        camera?.let {
            isFlashOn = !isFlashOn
            it.cameraControl.enableTorch(isFlashOn)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
    }

    // 条码分析器
    private class BarcodeAnalyzer(
        private val onBarcodeDetected: (List<Barcode>) -> Unit
    ) : ImageAnalysis.Analyzer {

        private val scanner = BarcodeScanning.getClient()

        override fun analyze(imageProxy: ImageProxy) {
            val mediaImage = imageProxy.image
            if (mediaImage != null) {
                val image = InputImage.fromMediaImage(
                    mediaImage,
                    imageProxy.imageInfo.rotationDegrees
                )

                scanner.process(image)
                    .addOnSuccessListener { barcodes ->
                        if (barcodes.isNotEmpty()) {
                            onBarcodeDetected(barcodes)
                        }
                    }
                    .addOnCompleteListener {
                        imageProxy.close()
                    }
            } else {
                imageProxy.close()
            }
        }
    }
}
