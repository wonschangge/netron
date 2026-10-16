<div align="center">
<img width="400px" height="100px" src="https://github.com/lutzroeder/netron/raw/main/.github/logo-light.svg#gh-light-mode-only">
<img width="400px" height="100px" src="https://github.com/lutzroeder/netron/raw/main/.github/logo-dark.svg#gh-dark-mode-only">
</div>

Netron is a viewer for neural network, deep learning and machine learning models.

Netron supports ONNX, TensorFlow Lite, PyTorch, torch.export, ExecuTorch, TorchScript, TensorFlow, Core ML, OpenVINO, Keras, Caffe, Darknet, Safetensors and NumPy.

Netron has experimental support for MLIR, JAX, GGUF, RKNN, ncnn, MNN, PaddlePaddle and scikit-learn.

## Fork additions

This fork (`wonschangge/netron`) adds **ONNX Operator Atlas** — an interactive explorer for the ONNX
operator metadata in `source/onnx-metadata.json` (opset evolution, per-operator version diffs,
operator × element-type matrix, side-by-side version comparison).

 * **Atlas**: [**Open**](https://wonschangge.github.io/netron/atlas/) the browser version
 * **Single file**: [download](https://wonschangge.github.io/netron/atlas/onnx-operator-atlas.html) and open it offline
 * **Source**: [`atlas/`](atlas) — built by `node package.js build web` into `dist/web/atlas/`,
   published together with the web app by `.github/workflows/pages.yml`

The atlas is independent of the Netron UI: both are built from the same metadata file and deployed
to the same Pages site. See [`atlas/AGENTS.md`](atlas/AGENTS.md) for data facts and design notes.

<p align='center'><a href='https://www.lutzroeder.com/ai'><img src='.github/screenshot.png' width='800'></a></p>

## Install

**Browser**: [**Start**](https://netron.app) the browser version.

**macOS**: [**Download**](https://github.com/lutzroeder/netron/releases/latest) the `.dmg` file or run `brew install --cask netron`.

**Linux**: [**Download**](https://github.com/lutzroeder/netron/releases/latest) the `.deb` or `.rpm` file.

**Windows**: [**Download**](https://github.com/lutzroeder/netron/releases/latest) the `.exe` installer or run `winget install -s winget netron`.

**Python**: `pip install netron`, then run `netron [FILE]` or `netron.start('[FILE]')`.

## Models

Sample model files to download or open using the browser version:

 * **ONNX**: [squeezenet](https://github.com/onnx/models/raw/main/validated/vision/classification/squeezenet/model/squeezenet1.0-3.onnx) [[open](https://netron.app?url=https://github.com/onnx/models/raw/main/validated/vision/classification/squeezenet/model/squeezenet1.0-3.onnx)]
 * **TorchScript**: [traced_online_pred_layer](https://github.com/ApolloAuto/apollo/raw/master/modules/prediction/data/traced_online_pred_layer.pt) [[open](https://netron.app?url=https://github.com/ApolloAuto/apollo/raw/master/modules/prediction/data/traced_online_pred_layer.pt)]
 * **TensorFlow Lite**: [yamnet](https://huggingface.co/thelou1s/yamnet/resolve/main/lite-model_yamnet_tflite_1.tflite) [[open](https://netron.app?url=https://huggingface.co/thelou1s/yamnet/blob/main/lite-model_yamnet_tflite_1.tflite)]
 * **TensorFlow**: [chessbot](https://github.com/srom/chessbot/raw/master/model/chessbot.pb) [[open](https://netron.app?url=https://github.com/srom/chessbot/raw/master/model/chessbot.pb)]
 * **Keras**: [mobilenet](https://github.com/aio-libs/aiohttp-demos/raw/master/demos/imagetagger/tests/data/mobilenet.h5) [[open](https://netron.app?url=https://github.com/aio-libs/aiohttp-demos/raw/master/demos/imagetagger/tests/data/mobilenet.h5)]

* **MLIR**: [edge_detection](https://github.com/iree-org/iree/raw/main/tests/e2e/stablehlo_models/edge_detection.mlir) [[open](https://netron.app?url=https://github.com/iree-org/iree/blob/main/tests/e2e/stablehlo_models/edge_detection.mlir)]

 * **Core ML**: [exermote](https://github.com/Lausbert/Exermote/raw/master/ExermoteInference/ExermoteCoreML/ExermoteCoreML/Model/Exermote.mlmodel) [[open](https://netron.app?url=https://github.com/Lausbert/Exermote/raw/master/ExermoteInference/ExermoteCoreML/ExermoteCoreML/Model/Exermote.mlmodel)]
 * **Darknet**: [yolo](https://github.com/AlexeyAB/darknet/raw/master/cfg/yolo.cfg) [[open](https://netron.app?url=https://github.com/AlexeyAB/darknet/raw/master/cfg/yolo.cfg)]
