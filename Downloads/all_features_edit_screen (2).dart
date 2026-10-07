import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../music/domain/entities/music_entity.dart';
import '../music/presentation/cubit/music_cubit.dart';
import 'package:flutter/services.dart';
import '../frames/frame_store_screen.dart';
import '../frames/domain/entities/footer_frame_mall_item.dart';

import 'package:image_picker/image_picker.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'dart:io';
import 'dart:math';
import 'package:design1123/features/middle_navbar_icon/_rotation_handle.dart';
import 'package:design1123/features/middle_navbar_icon/domain/entities/font_catalog_item.dart';
import 'package:design1123/features/middle_navbar_icon/domain/usecases/get_font_catalog.dart';
import 'package:design1123/features/middle_navbar_icon/domain/usecases/upload_design_image.dart';
import 'package:image/image.dart' as img;
import 'dart:ui' as ui;
import 'package:flutter/rendering.dart';
import 'package:path_provider/path_provider.dart';
import 'package:gal/gal.dart';
import 'package:share_plus/share_plus.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:video_player/video_player.dart';
import 'package:ffmpeg_kit_flutter_new_https_gpl/ffmpeg_kit.dart';
import 'package:ffmpeg_kit_flutter_new_https_gpl/return_code.dart';
import 'dart:typed_data';
import 'package:design1123/features/remove_background/domain/usecases/remove_background_usecase.dart';
import 'package:design1123/core/injection_container.dart';
import 'package:design1123/core/utils/download_watermark_composer.dart';
import 'package:design1123/core/widgets/export_progress_overlay.dart';
import 'package:design1123/features/saved_designs/domain/entities/saved_design.dart';
import 'package:design1123/features/saved_designs/presentation/utils/saved_design_export_recorder.dart';
import 'package:design1123/core/usecases/usecase.dart';
import 'package:design1123/core/services/auth_token_manager.dart';
import 'widgets/advanced_color_picker.dart';
import 'services/canvas_eyedropper_sampler.dart';
import '../../core/theme/app_gradients.dart';
import '../../core/widgets/gradient_icon.dart';
import 'package:flutter/scheduler.dart';
import 'package:provider/provider.dart';
import '../profile/business_provider.dart';
import '../../core/constants/baseurl.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'dart:async';
import '../templates/domain/template_model.dart';
import '../templates/domain/usecases/get_enriched_template_json.dart';
import '../templates/domain/layer_geometry_parser.dart';
import '../templates/domain/template_canvas_size_formatter.dart';
import '../templates/domain/usecases/get_footer_templates.dart';
import '../templates/presentation/widgets/footer_virtual_canvas.dart';
import '../templates/presentation/widgets/template_renderer.dart';
import '../profile_selector/domain/entities/profile_type.dart';
import '../profile_selector/domain/entities/user_profile_list_item.dart';
import '../profile_selector/domain/footer_business_profile_binder.dart';
import '../profile_selector/domain/usecases/get_selected_profile_type.dart';
import '../profile_selector/domain/usecases/get_user_profiles.dart';
import 'domain/entities/canvas_widget.dart';
import 'presentation/cubit/canvas_editor_cubit.dart';
import 'presentation/cubit/canvas_editor_state.dart';

export 'domain/entities/canvas_widget.dart';

double _asDouble(dynamic value, {double fallback = 0.0}) {
  if (value == null) return fallback;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString()) ?? fallback;
}

/// Runs in background isolate: picks best layout and normalizes raw layer maps.
Map<String, dynamic> _prepareTemplatePayloadForEditor(
  Map<String, dynamic> input,
) {
  TemplateLayerGeometryParser.resolvePsMeasured(input);
  final double aspectRatio = _asDouble(input['aspectRatio'], fallback: 1.0);
  final dynamic decodedInput = input['decoded'];
  if (decodedInput is Map<String, dynamic>) {
    return _prepareTemplatePayloadFromDecoded(decodedInput, aspectRatio);
  }

  final String responseBody = input['responseBody']?.toString() ?? '{}';
  final dynamic rawDecoded = json.decode(responseBody);

  // Handle both raw API response (with 'data' wrapper) and direct template objects
  final Map<String, dynamic> decoded =
      (rawDecoded is Map && rawDecoded.containsKey('data'))
          ? Map<String, dynamic>.from(rawDecoded['data'] as Map)
          : (rawDecoded is Map<String, dynamic> ? rawDecoded : <String, dynamic>{});

  return _prepareTemplatePayloadFromDecoded(decoded, aspectRatio);
}

Map<String, dynamic> _prepareTemplatePayloadFromDecoded(
  Map<String, dynamic> decoded,
  double aspectRatio,
) {
  if (decoded.isEmpty) {
    return {'layers': <Map<String, dynamic>>[]};
  }

  Map<String, dynamic>? layouts;

  // 1. Identify available layouts from variants or direct layouts field
  if (decoded['variants'] is List && (decoded['variants'] as List).isNotEmpty) {
    final List variants = decoded['variants'] as List;

    // IMPROVED: Select the best variant based on aspect ratio matching
    Map<String, dynamic>? bestVariant;
    double minArDiff = double.maxFinite;

    for (final dynamic v in variants) {
      if (v is! Map<String, dynamic>) continue;
      final dynamic doc = v['document'];
      if (doc is! Map<String, dynamic>) continue;
      final dynamic vLayouts = doc['layouts'];
      if (vLayouts is! Map<String, dynamic> || vLayouts.isEmpty) continue;

      // Extract aspect ratio from the first layout of this variant to represent the variant
      final firstLayout = vLayouts.values.first;
      if (firstLayout is Map<String, dynamic>) {
        final canvas = firstLayout['canvas'];
        final vw = _asDouble(canvas?['width'], fallback: 1080);
        final vh = _asDouble(canvas?['height'], fallback: 1080);
        final varAr = vw / vh;
        final diff = (varAr - aspectRatio).abs();

        if (diff < minArDiff) {
          minArDiff = diff;
          bestVariant = v;
        }
      }
    }

    bestVariant ??= variants.first as Map<String, dynamic>;
    if (bestVariant['document'] is Map<String, dynamic>) {
      layouts = bestVariant['document']['layouts'] as Map<String, dynamic>?;
    }
  } else if (decoded['layouts'] is Map<String, dynamic>) {
    layouts = decoded['layouts'] as Map<String, dynamic>;
  }

  // 2. Select the best layout key within the chosen variant/set
  Map<String, dynamic>? selectedLayout;
  if (layouts != null && layouts.isNotEmpty) {
    String layoutKey = 'square';
    if (aspectRatio < 0.9) {
      layoutKey = 'vertical';
    } else if (aspectRatio > 1.2) {
      layoutKey = 'landscape';
    }

    selectedLayout =
        layouts[layoutKey] ??
        layouts['vertical'] ??
        layouts['portrait'] ??
        layouts['post'] ??
        layouts.values.first;
  } else {
    selectedLayout = decoded;
  }

  if (selectedLayout is! Map<String, dynamic>) {
    return {'layers': <Map<String, dynamic>>[]};
  }

  final Map<String, dynamic>? canvas =
      selectedLayout['canvas'] is Map<String, dynamic>
          ? selectedLayout['canvas'] as Map<String, dynamic>
          : null;

  final List rawLayers =
      (selectedLayout['layers'] is List) ? selectedLayout['layers'] : const [];
  final List<Map<String, dynamic>> normalizedLayers = <Map<String, dynamic>>[];
  for (final dynamic layer in rawLayers) {
    if (layer is! Map<String, dynamic>) continue;

    // Preserve legacy behavior: skip meaningless empty group rectangles.
    if (layer['type'] == 'group' &&
        layer['shape'] == 'rectangle' &&
        layer['color'] == null &&
        layer['value'] == null) {
      continue;
    }

    TemplateLayerGeometryParser.normalizeEditorVisibility(layer);
    normalizedLayers.add(layer);
  }

  TemplateLayerGeometryParser.normalizeClipMaskCornerRadii(normalizedLayers);

  return {'canvas': canvas, 'layers': normalizedLayers};
}

class BlendModeLayer extends SingleChildRenderObjectWidget {
  final BlendMode blendMode;

  const BlendModeLayer({
    super.key,
    required this.blendMode,
    required super.child,
  });

  @override
  RenderObject createRenderObject(BuildContext context) {
    return _RenderBlendModeLayer(blendMode);
  }

  @override
  void updateRenderObject(
    BuildContext context,
    covariant _RenderBlendModeLayer renderObject,
  ) {
    renderObject.blendMode = blendMode;
  }
}

class _RenderBlendModeLayer extends RenderProxyBox {
  _RenderBlendModeLayer(this._blendMode);

  BlendMode _blendMode;
  set blendMode(BlendMode value) {
    if (_blendMode == value) return;
    _blendMode = value;
    markNeedsPaint();
  }

  @override
  void paint(PaintingContext context, Offset offset) {
    if (child == null) return;
    if (_blendMode == BlendMode.srcOver) {
      context.paintChild(child!, offset);
      return;
    }

    final Rect bounds = offset & size;
    context.canvas.saveLayer(bounds, Paint()..blendMode = _blendMode);
    context.paintChild(child!, offset);
    context.canvas.restore();
  }
}

class AllFeaturesEditScreen extends StatefulWidget {
  final String featureType;
  final String dimension;
  final String? initialImagePath;
  final String? initialVideoPath;
  final File? initialStickerFile;

  const AllFeaturesEditScreen({
    super.key,
    this.templateId,
    required this.featureType,
    required this.dimension,
    this.initialImagePath,
    this.initialVideoPath,
    this.initialStickerFile,
    this.initialStickerWidthRatio,
    this.initialStickerCenterRatio,
    this.initialText,
    this.initialTextSizeRatio,
    this.initialTextCenterRatio,
    this.initialTextColor,
    this.initialTextFont,
    this.initialWidgets,
    this.initialBackgroundColor,
    this.initialGradient,
    this.initialFramePath,
    this.initialFooterTemplateId,
    this.initialFooterLayoutJson,
    this.initialEnrichedTemplateJson,
  });

  final String? templateId;
  final double? initialStickerWidthRatio;
  final Offset? initialStickerCenterRatio;
  final String? initialText;
  final double? initialTextSizeRatio;
  final Offset? initialTextCenterRatio;
  final Color? initialTextColor;
  final String? initialTextFont;
  final List<CanvasWidget>? initialWidgets;
  final Color? initialBackgroundColor;
  final Gradient? initialGradient;
  final String? initialFramePath;
  final String? initialFooterTemplateId;
  final Map<String, dynamic>? initialFooterLayoutJson;
  final Map<String, dynamic>? initialEnrichedTemplateJson;

  @override
  State<AllFeaturesEditScreen> createState() => _AllFeaturesEditScreenState();
}

class _ShapeTintAnimation {
  const _ShapeTintAnimation({
    required this.widgetId,
    required this.from,
    required this.to,
  });

  final String widgetId;
  final Color from;
  final Color to;
}

class _AllFeaturesEditScreenState extends State<AllFeaturesEditScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  // ... (existing keys and state)
  final GlobalKey _canvasKey = GlobalKey();
  final GlobalKey _internalCanvasKey = GlobalKey();
  final GlobalKey _templateSampleRepaintKey = GlobalKey();
  Offset? _lastEyedropperTipCanvas;
  DateTime? _lastEyedropperSampleTime;
  bool _eyedropperSampleInFlight = false;
  static const Duration _eyedropperSampleInterval =
      Duration(milliseconds: 40);
  int _shapeColorRevision = 0;
  String? _pendingInitialFooterTemplateId;
  Map<String, dynamic>? _seedFooterLayoutJson;
  late final CanvasEditorCubit _canvasCubit;

  List<CanvasWidget> get _canvasWidgets => _canvasCubit.widgets;
  int get _nextZIndex => _canvasCubit.nextZIndex;

  String? get _selectedWidgetId => _canvasCubit.state.selectedWidgetId;
  set _selectedWidgetId(String? value) {
    if (value != null && _isUntouchableBackgroundLayerId(value)) return;
    _canvasCubit.setSelectedWidgetId(value);
  }

  static const String _untouchableBackgroundLayerId = 'layer_0';

  bool _isUntouchableBackgroundLayerId(String? widgetId) {
    if (widgetId == null || !widgetId.startsWith('template_')) return false;
    return widgetId.substring('template_'.length) == _untouchableBackgroundLayerId;
  }

  bool _isUntouchableBackgroundLayer(CanvasWidget widget) {
    return !widget.isFromFrame && _isUntouchableBackgroundLayerId(widget.id);
  }

  String? get _selectedFrame => _canvasCubit.state.selectedFrame;
  set _selectedFrame(String? value) => _canvasCubit.setSelectedFrame(
        value,
        frameJson: _canvasCubit.state.selectedFrameJson,
      );

  Map<String, dynamic>? get _selectedFrameJson =>
      _canvasCubit.state.selectedFrameJson;
  set _selectedFrameJson(Map<String, dynamic>? value) => _canvasCubit.setSelectedFrame(
        _canvasCubit.state.selectedFrame,
        frameJson: value,
      );

  Size get _canvasSize => _canvasCubit.state.canvasSize;
  set _canvasSize(Size value) => _canvasCubit.setCanvasSize(value);

  Color get _backgroundColor => _canvasCubit.state.backgroundColor;
  set _backgroundColor(Color value) => _canvasCubit.setBackgroundColor(value);

  Gradient? get _backgroundGradient => _canvasCubit.state.backgroundGradient;
  set _backgroundGradient(Gradient? value) =>
      _canvasCubit.setBackgroundGradient(value);

  String? get _backgroundImagePath => _canvasCubit.state.backgroundImagePath;
  set _backgroundImagePath(String? value) =>
      _canvasCubit.setBackgroundImagePath(value);

  bool get _isLoadingTemplate => _canvasCubit.state.isLoadingTemplate;
  set _isLoadingTemplate(bool value) =>
      _canvasCubit.setTemplateLoading(loading: value);

  double get _templateLoadingPercent => _canvasCubit.state.templateLoadingPercent;
  set _templateLoadingPercent(double value) =>
      _canvasCubit.setTemplateLoadingPercent(value);

  bool get _templateFetchFinished => _canvasCubit.state.templateFetchFinished;
  set _templateFetchFinished(bool value) =>
      _canvasCubit.setTemplateFetchFinished(value);

  bool get _footerLayoutsResolved => _canvasCubit.state.footerLayoutsResolved;
  set _footerLayoutsResolved(bool value) =>
      _canvasCubit.setFooterLayoutsResolved(value);

  bool get _isResizing => _canvasCubit.isResizing;
  bool get _isRotating => _canvasCubit.state.isRotating;
  double get _currentRotation => _canvasCubit.state.currentRotation;

  String? get _textStretchWidgetId => _canvasCubit.textStretchWidgetId;
  set _textStretchWidgetId(String? value) => _canvasCubit.textStretchWidgetId = value;

  double get _textStretchBaseFontSize => _canvasCubit.textStretchBaseFontSize;
  set _textStretchBaseFontSize(double value) =>
      _canvasCubit.textStretchBaseFontSize = value;

  double get _textStretchVisualScale => _canvasCubit.textStretchVisualScale;
  set _textStretchVisualScale(double value) =>
      _canvasCubit.textStretchVisualScale = value;

  double get _lastTouchAngle => _canvasCubit.lastTouchAngle;
  set _lastTouchAngle(double value) => _canvasCubit.lastTouchAngle = value;

  bool get _editorCanUndo => _canvasCubit.state.canUndo;
  bool get _editorCanRedo => _canvasCubit.state.canRedo;

  final Map<String, Map<String, dynamic>> _footerLayoutByTemplateId = {};
  final Map<String, Map<String, dynamic>> _footerCatalogByTemplateId = {};
  Map<String, dynamic>? _preparedFooterRenderLayout;
  final GetFooterTemplates _getFooterTemplates = sl<GetFooterTemplates>();
  String? _loadedFooterCanvasSizeSegment;
  final GetEnrichedTemplateJson _getEnrichedTemplateJson =
      sl<GetEnrichedTemplateJson>();
  Map<String, dynamic>? _cachedEnrichedTemplateJson;
  final GetUserProfiles _getUserProfiles = sl<GetUserProfiles>();
  UserProfileListItem? _businessProfile;
  final http.Client _httpClient = sl<http.Client>();
  bool _isEditingBottomSheetOpen = false;
  bool _hasManagedModalBottomSheetOpen = false;
  bool _isDismissingBottomSheets = false;
  PersistentBottomSheetController? _activePersistentBottomSheetController;
  bool _isColorPickerSheetOpen = false;
  bool _isColorPencilVisible = false;
  String? _colorPickerTargetWidgetId;
  StateSetter? _colorPickerParentSetState;
  StateSetter? _textEditSheetSetState;
  Offset _colorPencilCanvasOffset = Offset.zero;
  static const double _colorPencilSize = 72;
  final ValueNotifier<Color> _livePickerColor = ValueNotifier<Color>(Colors.black);
  _ShapeTintAnimation? _activeShapeTintAnimation;
  ValueChanged<Color>? _onColorPicked;
  final Set<String> _loadedFonts = {};
  final Map<String, String> _registeredFontFamilies = {};
  /// Natural pixel size of each logo layer's raster (`widgetId|imagePath` → size).
  final Map<String, Size> _imageSourceDimensions = {};
  final Set<String> _failedRemoteFontLoads = {};
  final Map<String, Future<void>> _fontLoadInFlight = {};
  int _fontRenderVersion = 0;
  Future<void>? _remoteFontsFuture;
  final List<FontCatalogItem> _remoteFontOptions = [];
  final GetFontCatalog _getFontCatalog = sl<GetFontCatalog>();
  final UploadDesignImage _uploadDesignImage = sl<UploadDesignImage>();
  final AuthTokenManager _tokenManager = sl<AuthTokenManager>();
  // Keep canvas hidden until every layer is ready, then reveal together.
  final bool _enableProgressiveTemplateRendering = false;
  final Duration _progressiveRenderDelay = const Duration(milliseconds: 16);
  int _templateLoadVersion = 0;

  Future<void> _loadRemoteFont(
    String fontFamily,
    Map<String, dynamic> fontUrls,
  ) async {
    if (_loadedFonts.contains(fontFamily)) return;

    final List<String> extensionPriority = <String>['ttf', 'TTF'];

    final List<String> candidateUrls = <String>[];
    final Set<String> seenUrls = <String>{};
    void addCandidate(String? url) {
      if (url == null || url.isEmpty) return;
      if (seenUrls.add(url)) {
        candidateUrls.add(url);
      }
    }

    for (final ext in extensionPriority) {
      addCandidate(fontUrls[ext]?.toString());
      addCandidate(fontUrls['.$ext']?.toString());
      for (final entry in fontUrls.entries) {
        final String key = entry.key.toString().toLowerCase();
        final String value = entry.value?.toString() ?? '';
        if (value.isEmpty) continue;
        if (key == ext.toLowerCase() ||
            key == '.${ext.toLowerCase()}' ||
            value.toLowerCase().endsWith('.${ext.toLowerCase()}')) {
          addCandidate(value);
        }
      }
    }
    if (candidateUrls.isEmpty) return;

    final String inFlightKey = fontFamily;
    final Future<void>? inFlight = _fontLoadInFlight[inFlightKey];
    if (inFlight != null) {
      await inFlight;
      return;
    }

    final Future<void> loadFuture = () async {
      Object? lastError;
      try {
        final String? refreshToken = await _tokenManager.getRefreshToken();
        final Map<String, String> authHeaders = <String, String>{
          if (refreshToken != null && refreshToken.isNotEmpty)
            'Authorization': 'Bearer $refreshToken',
        };
        Future<http.Response> fetchFont(Uri uri) async {
          // Try authenticated request first (if token exists),
          // then fallback to anonymous request for public font URLs.
          if (authHeaders.isNotEmpty) {
            final http.Response authed = await http
                .get(uri, headers: authHeaders)
                .timeout(const Duration(seconds: 12));
            if (authed.statusCode >= 200 && authed.statusCode < 300) {
              return authed;
            }
          }
          return http.get(uri).timeout(const Duration(seconds: 12));
        }

        for (final fontUrl in candidateUrls) {
          final String loadKey = '$fontFamily|$fontUrl';
          if (_failedRemoteFontLoads.contains(loadKey)) {
            continue;
          }
          try {
            final Uri uri = Uri.parse(fontUrl);
            final http.Response response = await fetchFont(uri);
            if (response.statusCode < 200 || response.statusCode >= 300) {
              throw HttpException(
                'Invalid statusCode: ${response.statusCode}, uri = $uri',
              );
            }
            final Uint8List bytes = response.bodyBytes;
            if (bytes.isEmpty) {
              _failedRemoteFontLoads.add(loadKey);
              continue;
            }

            final String uniqueFamily =
                '${fontFamily}_${DateTime.now().millisecondsSinceEpoch}';
            final fontLoader = FontLoader(uniqueFamily);
            fontLoader.addFont(Future.value(bytes.buffer.asByteData()));
            await fontLoader.load();
            _registeredFontFamilies[fontFamily] = uniqueFamily;
            _loadedFonts.add(fontFamily);
            if (mounted) {
              setState(() {
                _refitAllTextLayerBoxes(_canvasWidgets);
                _fontRenderVersion++;
              });
            }
            return;
          } catch (e) {
            lastError = e;
            _failedRemoteFontLoads.add(loadKey);
          }
        }
        if (lastError != null) {
          // debugPrint(
            // "Failed to load remote font $fontFamily from all candidate URLs: $lastError",
          // );
        }
      } finally {
        if (_fontLoadInFlight[inFlightKey] != null) {
          _fontLoadInFlight.remove(inFlightKey);
        }
      }
    }();

    _fontLoadInFlight[inFlightKey] = loadFuture;
    await loadFuture;
    _fontLoadInFlight.remove(inFlightKey);
  }

  String _normalizeFontLookupKey(String value) {
    return value.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
  }

  String _normalizeUrlKey(String? value) {
    if (value == null) return '';
    return value.trim().toLowerCase();
  }

  String _preferredFontFamilyForCatalogItem(FontCatalogItem item) {
    final String family = item.family.trim();
    if (family.isNotEmpty) return family;
    final String displayName = item.displayName.trim();
    if (displayName.isNotEmpty) return displayName;
    return item.postscriptName.trim();
  }

  String? _extractPrimaryTtfUrl(Map<String, dynamic>? fontUrls) {
    if (fontUrls == null || fontUrls.isEmpty) return null;
    final List<String> directKeys = <String>['ttf', 'TTF', '.ttf', '.TTF'];
    for (final key in directKeys) {
      final String candidate = fontUrls[key]?.toString().trim() ?? '';
      if (candidate.isNotEmpty && candidate.toLowerCase().endsWith('.ttf')) {
        return candidate;
      }
    }
    for (final entry in fontUrls.entries) {
      final String value = entry.value?.toString().trim() ?? '';
      if (value.isNotEmpty && value.toLowerCase().endsWith('.ttf')) {
        return value;
      }
    }
    return null;
  }

  String _deriveFontFamilyFromTtfUrl(
    String ttfUrl, {
    String fallback = 'Outfit',
  }) {
    try {
      final String fileName = Uri.parse(ttfUrl).pathSegments.isNotEmpty
          ? Uri.parse(ttfUrl).pathSegments.last
          : '';
      if (fileName.isEmpty) return fallback;
      final String withoutExt = fileName.replaceAll(
        RegExp(r'\.ttf$', caseSensitive: false),
        '',
      );
      final String normalized = withoutExt.replaceAll(
        RegExp(r'[^a-zA-Z0-9_-]'),
        '',
      );
      return normalized.isEmpty ? fallback : normalized;
    } catch (_) {
      return fallback;
    }
  }

  FontCatalogItem? _findFontCatalogMatch({
    required String fontFamily,
    String? postscriptName,
  }) {
    if (_remoteFontOptions.isEmpty) return null;

    if (postscriptName != null && postscriptName.trim().isNotEmpty) {
      final String normalizedPs = _normalizeFontLookupKey(postscriptName);
      if (normalizedPs.isNotEmpty) {
        for (final item in _remoteFontOptions) {
          if (_normalizeFontLookupKey(item.postscriptName) == normalizedPs) {
            return item;
          }
        }
      }
    }

    final String normalizedFamily = _normalizeFontLookupKey(fontFamily);
    if (normalizedFamily.isNotEmpty) {
      for (final item in _remoteFontOptions) {
        if (_normalizeFontLookupKey(item.family) == normalizedFamily ||
            _normalizeFontLookupKey(item.displayName) == normalizedFamily ||
            _normalizeFontLookupKey(item.postscriptName) == normalizedFamily) {
          return item;
        }
      }
    }

    return null;
  }

  Future<void> _ensureRemoteFontsLoaded() {
    _remoteFontsFuture ??= _fetchRemoteFonts();
    return _remoteFontsFuture!;
  }

  Future<void> _fetchRemoteFonts() async {
    try {
      final List<FontCatalogItem> parsed = await _getFontCatalog();

      if (parsed.isEmpty || !mounted) return;


      setState(() {
        _remoteFontOptions
          ..clear()
          ..addAll(parsed);
      });
    } catch (_) {
      // Keep fallback families if font catalog fetch fails.
    }
  }

  bool _isExporting = false;
  bool _isSharing = false;
  double _exportProgress = 0.0;
  String _currentPhotoCategory = "Nature";
  String _currentStickerCategory = "Thank You";

  // ... (music players)
  // Music State

  final AudioPlayer _audioPlayer = AudioPlayer();
  StreamSubscription? _audioSubscription;
  Music? _selectedMusic;
  Music? _tempTrimmingMusic;
  bool _isTrimmingMode = false;
  double _clipStartSeconds = 0.0;
  int _clipDurationSeconds = 15;
  String? _loadingMusicId;
  String? _currentlyPlayingId;
  bool _isTogglingCanvasMusicPlayback = false;
  final ScrollController _trimmerScrollController = ScrollController();

  VideoPlayerController? _initialVideoController;
  final Map<String, VideoPlayerController> _stickerVideoControllers = {};

  void _saveState() => _canvasCubit.saveHistory();

  void _undo() => _canvasCubit.undo();

  void _redo() => _canvasCubit.redo();

  void _notifyCanvasChanged() => _canvasCubit.notifyCanvasChanged();

  bool _hasVideoWidgets() {
    return _canvasWidgets.any((w) => w.type == CanvasWidgetType.video);
  }

  CanvasWidget? _getPrimaryVideoWidget() {
    try {
      return _canvasWidgets.firstWhere((w) => w.type == CanvasWidgetType.video);
    } catch (e) {
      return null;
    }
  }

  void _captureOriginalBaselineNow() => _canvasCubit.captureOriginalBaseline();

  void _tryCaptureOriginalBaseline() {
    if (_canvasCubit.originalBaseline != null) return;
    if (!_templateFetchFinished || !_footerLayoutsResolved || _isLoadingTemplate) {
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || _canvasCubit.originalBaseline != null) return;
        if (!_templateFetchFinished ||
            !_footerLayoutsResolved ||
            _isLoadingTemplate) {
          return;
        }
        _captureOriginalBaselineNow();
      });
    });
  }

  void _syncStickerVideoControllersAfterRestore() {
    final Set<String> keepIds = _canvasWidgets
        .where(
          (w) => w.type == CanvasWidgetType.video && w.videoPath != null,
        )
        .map((w) => w.id)
        .toSet();

    final List<String> removeIds = _stickerVideoControllers.keys
        .where((id) => !keepIds.contains(id))
        .toList();
    for (final String id in removeIds) {
      _stickerVideoControllers[id]?.dispose();
      _stickerVideoControllers.remove(id);
    }

    for (final CanvasWidget w in _canvasWidgets) {
      if (w.type == CanvasWidgetType.video &&
          w.videoPath != null &&
          !_stickerVideoControllers.containsKey(w.id)) {
        _initStickerVideo(w.id, w.videoPath!);
      }
    }
  }

  void _restoreOriginalBaseline() {
    _canvasCubit.restoreOriginalBaseline();
    _syncStickerVideoControllersAfterRestore();
  }

  void _resetDesign() {
    if (_canvasCubit.originalBaseline == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Template is still loading…',
              style: TextStyle(fontFamily: 'Outfit'),
            ),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
      return;
    }
    _saveState();
    _restoreOriginalBaseline();
  }

  File? _getEditableImageToUpload() {
    for (final CanvasWidget canvasWidget in _canvasWidgets.reversed) {
      final String? path = canvasWidget.imagePath;
      if (canvasWidget.type != CanvasWidgetType.logo ||
          !canvasWidget.isEditable ||
          path == null ||
          path.isEmpty ||
          path.startsWith('http')) {
        continue;
      }

      final File file = File(path);
      if (file.existsSync()) {
        return file;
      }
    }
    return null;
  }

  Future<bool> _uploadEditedImageIfAvailable() async {
    final File? editableImageFile = _getEditableImageToUpload();
    if (editableImageFile == null) return true;

    try {
      final result = await _uploadDesignImage(
        UploadDesignImageParams(imageFile: editableImageFile),
      );
      return result.fold(
        (failure) {
          // debugPrint('Design upload failed: ${failure.message}');
          return false;
        },
        (_) => true,
      );
    } catch (e) {
      // debugPrint('Design upload failed: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              "Image upload failed. Download cancelled.",
              style: TextStyle(fontFamily: 'Outfit'),
            ),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
      return false;
    }
  }

  Future<Uint8List> _exportPngBytesFromCapture(
    ui.Image image, {
    required bool includeWatermark,
  }) async {
    if (includeWatermark) {
      final Uint8List? watermarked =
          await DownloadWatermarkComposer.applyToImage(image);
      if (watermarked != null) {
        return watermarked;
      }
    }

    final ByteData? byteData = await image.toByteData(
      format: ui.ImageByteFormat.png,
    );
    if (byteData == null) {
      throw Exception('Failed to capture image bytes');
    }
    return byteData.buffer.asUint8List();
  }

  Future<File?> _captureDesignImageFile({
    double pixelRatio = 3.0,
    bool includeWatermark = false,
  }) async {
    _setExportProgress(0.15);
    setState(() => _selectedWidgetId = null);
    await Future.delayed(const Duration(milliseconds: 100));

    final boundary =
        _canvasKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    if (boundary == null) return null;

    _setExportProgress(0.45);
    final image = await boundary.toImage(pixelRatio: pixelRatio);
    final Uint8List pngBytes = await _exportPngBytesFromCapture(
      image,
      includeWatermark: includeWatermark,
    );

    final directory = await getTemporaryDirectory();
    final imagePath =
        '${directory.path}/design_${DateTime.now().millisecondsSinceEpoch}.png';
    final imageFile = File(imagePath);
    await imageFile.writeAsBytes(pngBytes);
    _setExportProgress(0.85);
    return imageFile;
  }

  Future<File?> _createVideoBackgroundComposite({
    bool includeWatermark = false,
  }) async {
    _setExportProgress(0.15);
    await Future.delayed(const Duration(milliseconds: 100));

    final boundary =
        _canvasKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    if (boundary == null) return null;

    _setExportProgress(0.35);
    final image = await boundary.toImage(pixelRatio: 4.0);
    final Uint8List pngBytes = await _exportPngBytesFromCapture(
      image,
      includeWatermark: false,
    );
    final directory = await getTemporaryDirectory();
    final overlayPath =
        '${directory.path}/overlay_${DateTime.now().millisecondsSinceEpoch}.png';
    final outputPath =
        '${directory.path}/final_video_${DateTime.now().millisecondsSinceEpoch}.mp4';
    await File(overlayPath).writeAsBytes(pngBytes);

    final targetWidth = image.width;
    final targetHeight = image.height;

    final List<String> inputs = <String>[
      '-i ${widget.initialVideoPath}',
      '-i $overlayPath',
    ];
    String filterComplex =
        '[0:v]scale=$targetWidth:$targetHeight:force_original_aspect_ratio=increase,crop=$targetWidth:$targetHeight[bg];[bg][1:v]overlay=0:0';

    if (includeWatermark) {
      final Uint8List? watermarkPng =
          await DownloadWatermarkComposer.createWatermarkOverlayPng(
        width: targetWidth,
        height: targetHeight,
      );
      if (watermarkPng != null) {
        final String watermarkPath =
            '${directory.path}/watermark_${DateTime.now().millisecondsSinceEpoch}.png';
        await File(watermarkPath).writeAsBytes(watermarkPng);
        inputs.add('-i "$watermarkPath"');
        filterComplex =
            '[0:v]scale=$targetWidth:$targetHeight:force_original_aspect_ratio=increase,crop=$targetWidth:$targetHeight[bg];'
            '[bg][1:v]overlay=0:0[composed];[composed][2:v]overlay=0:0';
      }
    }

    final command =
        '${inputs.join(' ')} -filter_complex "$filterComplex" -c:v libx264 -preset ultrafast -c:a copy $outputPath';

    _setExportProgress(0.65);
    final session = await FFmpegKit.execute(command);
    final returnCode = await session.getReturnCode();
    if (!ReturnCode.isSuccess(returnCode)) {
      final logs = await session.getOutput();
      throw Exception('FFmpeg failed: $logs');
    }

    _setExportProgress(0.95);
    return File(outputPath);
  }

  Future<File?> _createMusicVideoFile(
    Music music, {
    bool includeWatermark = false,
  }) async {
    _setExportProgress(0.15);
    setState(() => _selectedWidgetId = null);
    await Future.delayed(const Duration(milliseconds: 120));

    final boundary =
        _canvasKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    if (boundary == null) {
      throw Exception("Failed to capture canvas");
    }

    _setExportProgress(0.35);
    final ui.Image image = await boundary.toImage(pixelRatio: 3.0);
    final Uint8List pngBytes = await _exportPngBytesFromCapture(
      image,
      includeWatermark: includeWatermark,
    );
    final Directory directory = await getTemporaryDirectory();
    final int timestamp = DateTime.now().millisecondsSinceEpoch;
    final String imagePath = '${directory.path}/music_export_$timestamp.png';
    final String outputPath = '${directory.path}/music_export_$timestamp.mp4';
    await File(imagePath).writeAsBytes(pngBytes);

    _setExportProgress(0.5);
    final String? audioPath = await _prepareTrack(music);
    if (audioPath == null || audioPath.isEmpty) {
      throw Exception("Music file is unavailable");
    }

    final double clipStart = music.clipStart.clamp(0.0, 29.0);
    final int clipDuration = music.clipDuration.clamp(1, 30);

    final String command =
        '-loop 1 -i "$imagePath" -ss ${clipStart.toStringAsFixed(3)} -t $clipDuration -i "$audioPath" '
        '-c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p '
        '-shortest -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" "$outputPath"';

    _setExportProgress(0.7);
    final session = await FFmpegKit.execute(command);
    final returnCode = await session.getReturnCode();
    if (!ReturnCode.isSuccess(returnCode)) {
      final String? logs = await session.getOutput();
      throw Exception('FFmpeg failed: $logs');
    }

    _setExportProgress(0.95);
    return File(outputPath);
  }

  Future<void> _recordSavedDesignExport(
    File file, {
    required bool isVideo,
  }) async {
    try {
      final Map<String, dynamic> templateJson =
          _cachedEnrichedTemplateJson ??
          <String, dynamic>{
            if (widget.templateId != null) 'id': widget.templateId,
            'title': 'My Design',
          };

      await SavedDesignExportRecorder.record(
        mediaType: isVideo
            ? SavedDesignMediaType.video
            : SavedDesignMediaType.image,
        previewPath: file.path,
        templateJson: templateJson,
        sourceTemplateId: widget.templateId ?? templateJson['id']?.toString(),
        dimension: widget.dimension,
        editorSnapshot: <String, dynamic>{
          'selectedFooterTemplateId':
              _selectedFrameJson?['id']?.toString() ??
              widget.initialFooterTemplateId,
          'footerLayoutJson': _selectedFrameJson,
          'initialVideoPath': widget.initialVideoPath,
        },
      );
    } catch (_) {}
  }

  void _setExportProgress(double value) {
    if (!mounted) return;
    setState(() {
      _exportProgress = value.clamp(0.0, 1.0);
    });
  }

  Future<File?> _generateShareableFile() async {
    if (_hasVideoWidgets()) {
      return _createVideoExportFromWidgets(includeWatermark: true);
    }

    if (widget.initialVideoPath == null && _selectedMusic != null) {
      return _createMusicVideoFile(
        _selectedMusic!,
        includeWatermark: true,
      );
    }

    if (widget.initialVideoPath != null) {
      setState(() => _selectedWidgetId = null);
      await Future.delayed(const Duration(milliseconds: 100));
      return _createVideoBackgroundComposite(includeWatermark: true);
    }

    return _captureDesignImageFile(includeWatermark: true);
  }

  Future<void> _shareDesign() async {
    if (_isExporting || _isSharing) return;

    _audioPlayer.pause();
    setState(() {
      _isSharing = true;
      _exportProgress = 0.05;
    });

    try {
      final File? file = await _generateShareableFile();
      if (file == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                "Failed to prepare design for sharing.",
                style: TextStyle(fontFamily: 'Outfit'),
              ),
              backgroundColor: Colors.red,
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
        return;
      }

      const String appName = "Design 11-23";
      const String description =
          "Check out this amazing design I created using $appName! Download the app now to create your own.";

      _setExportProgress(0.95);

      await Share.shareXFiles(
        [XFile(file.path)],
        text: "$appName\n\n$description",
        subject: "Created with $appName",
      );

      unawaited(
        _recordSavedDesignExport(
          file,
          isVideo: file.path.toLowerCase().endsWith('.mp4'),
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              "Sharing failed. Please try again.",
              style: TextStyle(fontFamily: 'Outfit'),
            ),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSharing = false;
          _exportProgress = 0.0;
        });
      }
    }
  }

  Future<void> _downloadDesign() async {
    _audioPlayer.pause();
    try {
      final bool uploadSuccess = await _uploadEditedImageIfAvailable();
      if (!uploadSuccess) return;

      // 1. Check if this is a video template (has video widgets)
      if (_hasVideoWidgets()) {
        await _exportAsVideo();
        return;
      }

      // 1.1 Image template + selected music -> export as MP4 (same flow as template detail).
      if (widget.initialVideoPath == null && _selectedMusic != null) {
        await _exportImageWithMusicAsVideo(_selectedMusic!);
        return;
      }

      // 2. Deselect any active widget
      setState(() {
        _selectedWidgetId = null;
      });

      // Wait for selection handles to disappear
      await Future.delayed(const Duration(milliseconds: 100));

      // Handle Video Background Export
      if (widget.initialVideoPath != null) {
        setState(() {
          _isExporting = true;
          _exportProgress = 0.05;
          _selectedWidgetId = null;
        });
        await Future.delayed(const Duration(milliseconds: 100));

        try {
          final file = await _createVideoBackgroundComposite(
            includeWatermark: true,
          );
          if (file != null) {
            await Gal.putVideo(file.path);
            unawaited(_recordSavedDesignExport(file, isVideo: true));
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  "Video saved to gallery!",
                  style: TextStyle(fontFamily: 'Outfit'),
                ),
                backgroundColor: Colors.green,
                behavior: SnackBarBehavior.floating,
              ),
            );
          }
          }
        } catch (e) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  "Failed to save video: $e",
                  style: TextStyle(fontFamily: 'Outfit'),
                ),
                backgroundColor: Colors.red,
                behavior: SnackBarBehavior.floating,
              ),
            );
          }
        }
        return;
      }

      // 2. Capture the canvas (Original Image Logic)
      setState(() {
        _isExporting = true;
        _exportProgress = 0.05;
      });
      final imageFile = await _captureDesignImageFile(includeWatermark: true);
      if (imageFile == null) return;

      // 4. Save to gallery using gal
      _setExportProgress(0.92);
      await Gal.putImage(imageFile.path);
      unawaited(_recordSavedDesignExport(imageFile, isVideo: false));

      // 5. Notify user
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              "Design saved to gallery!",
              style: TextStyle(fontFamily: 'Outfit'),
            ),
            backgroundColor: Colors.green,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              "Failed to save design: $e",
              style: TextStyle(fontFamily: 'Outfit'),
            ),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isExporting = false;
          _exportProgress = 0.0;
        });
      }
    }
  }

  Future<void> _exportImageWithMusicAsVideo(Music music) async {
    setState(() {
      _isExporting = true;
      _exportProgress = 0.05;
    });
    try {
      final file = await _createMusicVideoFile(
        music,
        includeWatermark: true,
      );
      if (file == null) return;

      await Gal.putVideo(file.path);
      unawaited(_recordSavedDesignExport(file, isVideo: true));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              "Video with music saved!",
              style: TextStyle(fontFamily: 'Outfit'),
            ),
            backgroundColor: Colors.green,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              "Failed to save video with music: $e",
              style: TextStyle(fontFamily: 'Outfit'),
            ),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isExporting = false;
          _exportProgress = 0.0;
        });
      }
    }
  }

  Future<File?> _createVideoExportFromWidgets({
    bool includeWatermark = false,
  }) async {
      final directory = await getTemporaryDirectory();
    _setExportProgress(0.12);

      // 1. Identify Video Sticker
      final videoWidget = _getPrimaryVideoWidget();
      if (videoWidget == null || videoWidget.videoPath == null) {
        throw Exception('No video widget found');
      }

      final videoController = _stickerVideoControllers[videoWidget.id];
      if (videoController == null || !videoController.value.isInitialized) {
        throw Exception('Video not initialized');
      }

      // 2. Prepare Inputs
      String? bgInputPath;
      bool isBgImage = false;
      Color captureBgColor = _backgroundColor;

      // Determine Background Source
      // Determine Background Source
      if (widget.initialVideoPath != null) {
        bgInputPath = widget.initialVideoPath!;
      } else if (_backgroundImagePath != null) {
        if (_backgroundImagePath!.startsWith('http')) {
          // ... (existing download logic) ...
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text("Downloading background... please wait."),
              ),
            );
          }
          final bgResponse = await HttpClient().getUrl(
            Uri.parse(_backgroundImagePath!),
          );
          final bgFile = await bgResponse.close();
          bgInputPath =
              '${directory.path}/temp_bg_${DateTime.now().millisecondsSinceEpoch}.png';
          await bgFile.pipe(File(bgInputPath).openWrite());
          isBgImage = true;
        } else {
          bgInputPath = _backgroundImagePath!;
          isBgImage = true;
        }
      } else if (_backgroundGradient != null) {
        // Handle Gradient Background by capturing it as an image
        // 1. Create a RepaintBoundary just for the gradient
        final gradientRecorder = ui.PictureRecorder();
        final gradientCanvas = Canvas(gradientRecorder);
        final rect = Rect.fromLTWH(0, 0, _canvasSize.width, _canvasSize.height);
        final paint = Paint()..shader = _backgroundGradient!.createShader(rect);
        gradientCanvas.drawRect(rect, paint);

        final gradientPicture = gradientRecorder.endRecording();
        final gradientImage = await gradientPicture.toImage(
          _canvasSize.width.toInt(),
          _canvasSize.height.toInt(),
        );
        final gradientBytes = await gradientImage.toByteData(
          format: ui.ImageByteFormat.png,
        );

        bgInputPath =
            '${directory.path}/gradient_bg_${DateTime.now().millisecondsSinceEpoch}.png';
        await File(
          bgInputPath,
        ).writeAsBytes(gradientBytes!.buffer.asUint8List());
        isBgImage = true;
      }

      // 3. Capture Overlay (Text/Static Sticker only)
      // Deselect handles
      setState(() => _selectedWidgetId = null);
      await Future.delayed(const Duration(milliseconds: 100));
      _setExportProgress(0.35);

      final originalWidgets = List<CanvasWidget>.from(_canvasWidgets);

      // Hide Video Widgets AND Background for capture
      // (Background will be added via FFmpeg, Video via FFmpeg)
      setState(() {
        // Remove video widgets temporarily
        _canvasWidgets.removeWhere((w) => w.type == CanvasWidgetType.video);
        // Make background transparent for capture
        _backgroundColor = Colors.transparent;
        _backgroundImagePath = null;
      });

      await Future.delayed(
        const Duration(milliseconds: 100),
      ); // Wait for rebuild

      final boundary =
          _canvasKey.currentContext?.findRenderObject()
              as RenderRepaintBoundary?;
      if (boundary == null) throw Exception('Failed to capture canvas');

      _setExportProgress(0.5);
      final image = await boundary.toImage(pixelRatio: 4.0);
      final Uint8List pngBytes = await _exportPngBytesFromCapture(
        image,
        includeWatermark: false,
      );

      final targetWidth = image.width;
      final targetHeight = image.height;

      // Restore State
      setState(() {
        _canvasWidgets.clear();
        _canvasWidgets.addAll(originalWidgets);
        _backgroundColor = captureBgColor;
        _backgroundImagePath = bgInputPath != null && isBgImage
            ? bgInputPath
            : null; // Restore if it was image
      });

      final overlayPath =
          '${directory.path}/overlay_${DateTime.now().millisecondsSinceEpoch}.png';
      await File(overlayPath).writeAsBytes(pngBytes);

      // Prepare Video Sticker File
      String videoStickerPath;
      if (videoWidget.videoPath!.startsWith('http')) {
        final videoResponse = await HttpClient().getUrl(
          Uri.parse(videoWidget.videoPath!),
        );
        final videoFile = await videoResponse.close();
        videoStickerPath =
            '${directory.path}/sticker_${DateTime.now().millisecondsSinceEpoch}.mp4';
        await videoFile.pipe(File(videoStickerPath).openWrite());
      } else {
        videoStickerPath = videoWidget.videoPath!;
      }

      // --- Geometry Calculations ---
      final scaleFactor = targetWidth / _canvasSize.width;

      // Ensure target dimensions are even for libx264
      int finalTargetW = targetWidth;
      int finalTargetH = targetHeight;
      if (finalTargetW % 2 != 0) finalTargetW--;
      if (finalTargetH % 2 != 0) finalTargetH--;

      // Sticker dimensions in output
      // Video widget is rendered in a container of width 150.
      final stickerBaseSize = 150.0;
      final stickerDisplayWidth = stickerBaseSize * videoWidget.scale;

      // Calculate output dimensions (must be even)
      int stickerW = (stickerDisplayWidth * scaleFactor).toInt();
      if (stickerW % 2 != 0) stickerW++;

      // Calculate visual position correction due to Transform.scale (center alignment)
      // Visual Left = Position - (VisualWidth - BaseWidth) / 2
      final visualOffsetX = (stickerBaseSize * (videoWidget.scale - 1)) / 2;
      final visualOffsetY = (stickerBaseSize * (videoWidget.scale - 1)) / 2;

      final visualX = videoWidget.position.dx - visualOffsetX;
      final visualY = videoWidget.position.dy - visualOffsetY;

      final stickerX = (visualX * scaleFactor).toInt();
      final stickerY = (visualY * scaleFactor).toInt();

      final outputPath =
          '${directory.path}/template_video_${DateTime.now().millisecondsSinceEpoch}.mp4';

      // --- Build FFmpeg Command ---
      List<String> inputs = [];
      String filterComplex = "";

      // Input 0: Background
      if (bgInputPath != null) {
        inputs.add(
          isBgImage ? '-loop 1 -i "$bgInputPath"' : '-i "$bgInputPath"',
        );
      } else {
        // Color Background
        String colorHex =
            "0x${captureBgColor.value.toRadixString(16).substring(2)}";
        inputs.add(
          '-f lavfi -i color=c=$colorHex:s=${finalTargetW}x${finalTargetH}',
        );
      }

      // Input 1: Video Sticker
      inputs.add('-i "$videoStickerPath"');

      // Input 2: Overlay
      inputs.add('-i "$overlayPath"');

      // Filter Logic
      // 1. [0:v] (BG): Scale/Crop to Target Size
      if (bgInputPath == null) {
        filterComplex += "[0:v]null[bg];";
      } else {
        filterComplex +=
            "[0:v]scale=$finalTargetW:$finalTargetH:force_original_aspect_ratio=increase,crop=$finalTargetW:$finalTargetH[bg];";
      }

      // 2. [1:v] (Sticker): Scale to Calculated Size
      filterComplex += "[1:v]scale=$stickerW:-2[sticker];";

      // 3. Composite
      filterComplex += "[bg][sticker]overlay=$stickerX:$stickerY[comp1];";

      String? watermarkPath;
      if (includeWatermark) {
        final Uint8List? watermarkPng =
            await DownloadWatermarkComposer.createWatermarkOverlayPng(
          width: finalTargetW,
          height: finalTargetH,
        );
        if (watermarkPng != null) {
          watermarkPath =
              '${directory.path}/watermark_${DateTime.now().millisecondsSinceEpoch}.png';
          await File(watermarkPath).writeAsBytes(watermarkPng);
          inputs.add('-i "$watermarkPath"');
          filterComplex +=
              "[comp1][2:v]overlay=0:0[composed];[composed][3:v]overlay=0:0";
        } else {
      filterComplex += "[comp1][2:v]overlay=0:0";
        }
      } else {
        filterComplex += "[comp1][2:v]overlay=0:0";
      }

      // Duration Logic
      // 1. Get sticker duration
      int duration = videoController.value.duration.inSeconds;
      // 2. Fallback if 0 (e.g. streaming or initialization issue)
      if (duration == 0) duration = 15;
      // 3. Cap at 30s
      final limitedDuration = duration > 30 ? 30 : duration;

      // NOTE: We remove -shortest because generated color/loop bg are infinite.
      // We rely solely on -t to cut the video.
      String cmd =
          "${inputs.join(' ')} -filter_complex \"$filterComplex\" -c:v libx264 -pix_fmt yuv420p -preset ultrafast -t $limitedDuration \"$outputPath\"";

      _setExportProgress(0.72);
      final session = await FFmpegKit.execute(cmd);
      final returnCode = await session.getReturnCode();

      if (!ReturnCode.isSuccess(returnCode)) {
        final logs = await session.getOutput();
        throw Exception('FFmpeg failed: $logs');
      }

      // Cleanup
      try {
        await File(overlayPath).delete();
        if (watermarkPath != null) {
          await File(watermarkPath).delete();
        }
        if (videoWidget.videoPath!.startsWith('http')) {
          await File(videoStickerPath).delete();
        }
      } catch (e) {}

      _setExportProgress(0.95);
      return File(outputPath);
  }

  Future<void> _exportAsVideo() async {
    setState(() {
      _isExporting = true;
      _exportProgress = 0.05;
    });
    try {
      final file = await _createVideoExportFromWidgets(includeWatermark: true);
      if (file == null) return;

      await Gal.putVideo(file.path);
      unawaited(_recordSavedDesignExport(file, isVideo: true));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              "Video template saved!",
              style: TextStyle(fontFamily: 'Outfit'),
            ),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Failed: $e", style: TextStyle(fontFamily: 'Outfit')),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isExporting = false;
          _exportProgress = 0.0;
        });
      }
    }
  }

  bool _initialWidgetsAdded = false;

  void _addInitialWidgets(Size size) {
    if (!_initialWidgetsAdded) {
      _initialWidgetsAdded = true;

      // 1. Add Product Sticker
      if (widget.initialStickerFile != null) {
        final id = DateTime.now().millisecondsSinceEpoch.toString();
        double widthRatio = widget.initialStickerWidthRatio ?? 0.3;
        Offset centerRatio =
            widget.initialStickerCenterRatio ?? const Offset(0.5, 0.5);

        double scale = (size.width * widthRatio) / 100;
        double dx = (size.width * centerRatio.dx) - 50;
        double dy = (size.height * centerRatio.dy) - 50;

        _canvasWidgets.add(
          CanvasWidget(
            id: id,
            type: CanvasWidgetType.logo,
            position: Offset(dx, dy),
            scale: scale,
            imagePath: widget.initialStickerFile!.path,
          ),
        );
      }

      // 2. Add Text Sticker (Added AFTER product so it's on top)
      if (widget.initialText != null) {
        final id = (DateTime.now().millisecondsSinceEpoch + 1).toString();
        double sizeRatio = widget.initialTextSizeRatio ?? 0.1;
        Offset centerRatio =
            widget.initialTextCenterRatio ?? const Offset(0.5, 0.5);

        double fontSize = size.width * sizeRatio;
        // Estimate width/height based on fontSize (rough heuristic)
        double estimatedWidth = size.width * 0.8;
        double estimatedHeight = fontSize * 1.5;

        double dx = (size.width * centerRatio.dx) - (estimatedWidth / 2);
        double dy = (size.height * centerRatio.dy) - (estimatedHeight / 2);

        _canvasWidgets.add(
          CanvasWidget(
            id: id,
            type: CanvasWidgetType.text,
            position: Offset(dx, dy),
            scale: 1.0,
            text: widget.initialText,
            fontSize: fontSize,
            color: widget.initialTextColor ?? Colors.black,
            fontFamily: widget.initialTextFont ?? 'Outfit',
            fontWeight: FontWeight.bold,
            textAlign: TextAlign.center,
          ),
        );
      }

      // 3. Add Custom Initial Widgets (with Normalization)
      if (widget.initialWidgets != null) {
        // Create deep copies to modify independently
        List<CanvasWidget> widgets = widget.initialWidgets!
            .map((w) => w.copy())
            .toList();

        for (int i = 0; i < widgets.length; i++) {
          var w = widgets[i];

          // Heuristic: If first widget is an image/logo AND size matches canvas, treat as background
          // We assume boxWidth/boxHeight are relative (0.0-1.0) at this stage.
          bool isFullSize =
              (w.boxWidth ?? 0) >= 0.99 && (w.boxHeight ?? 0) >= 0.99;

          if (i == 0 &&
              w.type == CanvasWidgetType.logo &&
              w.imagePath != null &&
              isFullSize) {
            // Check 1: Promote to background if no background is currently set
            if (_backgroundImagePath == null &&
                widget.initialBackgroundColor == null) {
              if (mounted) {
                setState(() {
                  _backgroundImagePath = w.imagePath;
                });
              }
              continue; // Promoted to background, skip adding as widget
            }

            // Check 2: Deduplicate if the layer matches the existing background image
            if (_backgroundImagePath != null &&
                _backgroundImagePath == w.imagePath) {
              continue; // Duplicate of background, skip
            }

            // Otherwise, keep the layer (e.g. we have a background color, but this is an image layer on top)
          }

          // --- Normalization Logic ---
          // Heuristic: If positions are small (<= 2.0), assume relative and scale up.
          // We check position separately from width because Text widgets might not have a fixed boxWidth.
          bool positionIsRelative =
              w.position.dx.abs() <= 2.0 && w.position.dy.abs() <= 2.0;
          bool widthIsRelative = (w.boxWidth ?? 100) <= 2.0;

          // Scale width/height
          if (widthIsRelative) {
            w.boxWidth = (w.boxWidth ?? 0) * size.width;
            w.boxHeight = (w.boxHeight ?? 0) * size.height;
          }

          // Font Size Normalization
          if (w.type == CanvasWidgetType.text && w.fontSize <= 2.0) {
            w.fontSize = w.fontSize * size.width;
          }

          // Position Normalization
          if (positionIsRelative) {
            w.position = Offset(
              w.position.dx * size.width,
              w.position.dy * size.height,
            );
          } else {}

          // Dedup check: Only add if ID doesn't exist
          if (!_canvasWidgets.any((existing) => existing.id == w.id)) {
            _canvasWidgets.add(w);

            // Initialize video controller if it's a video widget
            if (w.type == CanvasWidgetType.video && w.videoPath != null) {
              _initStickerVideo(w.id, w.videoPath!);
            }
          } else {
            // debugPrint("DEBUG: Skipped duplicate widget with ID: ${w.id}");
          }
        }
        // debugPrint(
          // "DEBUG: AllFeaturesEditScreen initialized with ${_canvasWidgets.length} widgets.",
        // );
        // _canvasWidgets.forEach(
        //   (w) => debugPrint("DEBUG: Widget ${w.id} - Type: ${w.type}"),
        // );

        // Prefetch fonts for initial widgets after ensuring remote catalog is loaded
        _ensureRemoteFontsLoaded().then((_) {
          bool changed = false;
          for (final widget in _canvasWidgets) {
            if (widget.type == CanvasWidgetType.text &&
                widget.fontFamily != null) {
              final String? layerTtfUrl = _extractPrimaryTtfUrl(
                widget.fontUrls,
              );
              final FontCatalogItem? catalogMatch = _findFontCatalogMatch(
                fontFamily: widget.fontFamily!,
              );
              final String matchedCatalogUrl = catalogMatch?.url?.trim() ?? '';

              if (layerTtfUrl == null || layerTtfUrl.isEmpty) {
                if (matchedCatalogUrl.isNotEmpty) {
                  widget.fontUrls ??= <String, dynamic>{};
                  widget.fontUrls!['ttf'] = matchedCatalogUrl;
                  changed = true;
                }
              } else if (matchedCatalogUrl.isNotEmpty &&
                  matchedCatalogUrl != layerTtfUrl) {
                widget.fontUrls ??= <String, dynamic>{};
                widget.fontUrls!['.ttf'] = matchedCatalogUrl;
                changed = true;
              }
            }
          }
          if (changed && mounted) {
            setState(() {});
          }
          _refitAllTextLayerBoxes(_canvasWidgets);
          _prefetchTemplateFonts(_canvasWidgets);
          _prefetchImageSourceDimensions(_canvasWidgets);
        });
      }
    }
  }

  void _addLockedFrame(String framePath) {
    final id = "frame_${DateTime.now().millisecondsSinceEpoch}";

    // Calculate aspect ratio of frame to ensure it covers canvas
    // For now, assuming frame matches canvas aspect ratio

    setState(() {
      _canvasWidgets.add(
        CanvasWidget(
          id: id,
          type: CanvasWidgetType.logo, // Render as image
          position: Offset(0, 0),
          scale: 1.0,
          imagePath: framePath,
          boxWidth: _canvasSize.width, // Absolute width
          boxHeight: _canvasSize.height, // Absolute height
          isLocked: true, // LOCK IT
        ),
      );
    });
  }

  void _initStickerVideo(String id, String videoPath) {
    VideoPlayerController? controller;
    if (videoPath.startsWith('http')) {
      controller = VideoPlayerController.networkUrl(Uri.parse(videoPath));
    } else {
      controller = VideoPlayerController.file(File(videoPath));
    }

    controller.initialize().then((_) {
      if (mounted) {
        setState(() {
          _stickerVideoControllers[id] = controller!;
          controller.play();
          controller.setLooping(true);
        });
      }
    });
  }

  Future<void> _loadBusinessProfile() async {
    final ProfileType? selectedType = await sl<GetSelectedProfileType>()();
    final result = await _getUserProfiles(NoParams());
    result.fold((_) {}, (List<UserProfileListItem> profiles) {
      if (!mounted) return;
      final UserProfileListItem? profile =
          FooterBusinessProfileBinder.findActiveFooterProfile(
        profiles,
        selectedType: selectedType,
      );
      if (profile?.id != _businessProfile?.id ||
          profile?.name != _businessProfile?.name ||
          profile?.mobileNumber != _businessProfile?.mobileNumber ||
          profile?.photoUrl != _businessProfile?.photoUrl ||
          profile?.userPhotoUrl != _businessProfile?.userPhotoUrl) {
        setState(() => _businessProfile = profile);
        if (_selectedFrameJson != null) {
          _applyFooterLayout(_selectedFrameJson);
        }
      }
    });
  }

  String? _resolveBusinessLogoUrl() {
    String? fromProvider;
    try {
      fromProvider = context.read<BusinessProvider>().logoPath;
    } catch (_) {
      fromProvider = null;
    }
    return FooterBusinessProfileBinder.resolveBusinessLogoUrl(
      _businessProfile,
      fallbackLogoUrl: fromProvider,
    );
  }

  String? _resolveBusinessUserPhotoUrl() {
    return FooterBusinessProfileBinder.resolveBusinessUserPhotoUrl(
      _businessProfile,
    );
  }

  @override
  void initState() {
    super.initState();
    _canvasCubit = sl<CanvasEditorCubit>();
    _pendingInitialFooterTemplateId = widget.initialFooterTemplateId;
    if (widget.initialFooterLayoutJson != null &&
        widget.initialFooterLayoutJson!.isNotEmpty) {
      _seedFooterLayoutJson =
          Map<String, dynamic>.from(widget.initialFooterLayoutJson!);
      final String? footerId = _seedFooterLayoutJson!['id']?.toString();
      if (footerId != null && footerId.isNotEmpty) {
        _footerLayoutByTemplateId[footerId] = _seedFooterLayoutJson!;
      }
      _selectedFrameJson = _seedFooterLayoutJson;
    }
    unawaited(_ensureRemoteFontsLoaded());
    unawaited(_loadBusinessProfile());
    unawaited(DownloadWatermarkComposer.preload());

    // Audio Looping Logic
    _audioSubscription = _audioPlayer.onPositionChanged.listen((position) {
      if (!mounted) return;

      final Music? targetMusic = _isTrimmingMode
          ? _tempTrimmingMusic
          : _selectedMusic;
      final double start = _isTrimmingMode
          ? _clipStartSeconds
          : (targetMusic?.clipStart ?? 0.0);
      final int duration = _isTrimmingMode
          ? _clipDurationSeconds
          : (targetMusic?.clipDuration ?? 15);

      if (targetMusic != null) {
        final int currentMs = position.inMilliseconds;
        final int startMs = (start * 1000).toInt();
        final int endMs = startMs + (duration * 1000);

        if (currentMs >= endMs) {
          _audioPlayer.seek(Duration(milliseconds: startMs));
        }
      }
    });

    if (widget.templateId != null) {
      _fetchTemplateData();
    } else {
      _templateFetchFinished = true;
    }

    // 1. Initialize Canvas Size from Dimension String
    // 1. Initialize Canvas Size from Dimension String
    List<String> parts = widget.dimension.split('×');
    if (parts.length != 2) {
      parts = widget.dimension.split('x');
    }

    double width = 1080;
    double height = 1920;
    if (parts.length == 2) {
      width = double.tryParse(parts[0]) ?? 1080;
      height = double.tryParse(parts[1]) ?? 1920;
    }
    // debugPrint(
      // "DEBUG: AllFeaturesEditScreen - Received Dimension String: ${widget.dimension}",
    // );
    // debugPrint(
      // "DEBUG: AllFeaturesEditScreen - Parsed Canvas Size: $width x $height",
    // );
    _canvasSize = Size(width, height);
    if (_seedFooterLayoutJson != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _applyFooterLayout(_seedFooterLayoutJson);
        }
      });
    }
    unawaited(_loadFooterFrames());

    // 2. Load initial image/background
    if (widget.initialImagePath != null) {
      _backgroundImagePath = widget.initialImagePath;
    }
    if (widget.initialBackgroundColor != null) {
      _backgroundColor = widget.initialBackgroundColor!;
    }
    if (widget.initialGradient != null) {
      _backgroundGradient = widget.initialGradient;
    }

    // 3. Load initial video
    if (widget.initialVideoPath != null) {
      VideoPlayerController controller;
      if (widget.initialVideoPath!.startsWith('http')) {
        controller = VideoPlayerController.networkUrl(
          Uri.parse(widget.initialVideoPath!),
        );
      } else {
        controller = VideoPlayerController.file(File(widget.initialVideoPath!));
      }

      _initialVideoController = controller
        ..initialize().then((_) {
          if (mounted) {
            setState(() {});
            _initialVideoController!.play();
            _initialVideoController!.setLooping(true);
          }
        });
    }

    // 4. Load initial Frame (Locked)
    if (widget.initialFramePath != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        // Add after layout to ensure canvas size is final
        _addLockedFrame(widget.initialFramePath!);
      });
    }

    // Save initial state
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _saveState();
    });

    // Initialize widgets with the correct design resolution
    if (!_initialWidgetsAdded) {
      _addInitialWidgets(_canvasSize);
    }

  }

  String _footerCanvasSizeSegment() {
    return TemplateCanvasSizeFormatter.fromSize(_canvasSize);
  }

  Future<void> _loadFooterFrames({bool force = false}) async {
    if (_canvasSize == Size.zero) return;

    final String canvasSizeSegment = _footerCanvasSizeSegment();
    if (canvasSizeSegment.isEmpty) return;

    if (!force &&
        _footerLayoutsResolved &&
        _loadedFooterCanvasSizeSegment == canvasSizeSegment) {
      return;
    }

    final bool sizeChanged =
        _loadedFooterCanvasSizeSegment != null &&
        _loadedFooterCanvasSizeSegment != canvasSizeSegment;

    if (sizeChanged && mounted) {
      setState(() {
        _footerLayoutByTemplateId.clear();
        _footerCatalogByTemplateId.clear();
        _selectedFrameJson = null;
        _selectedFrame = null;
        _canvasWidgets.removeWhere((CanvasWidget w) => w.isFromFrame);
        if (_selectedWidgetId != null &&
            _selectedWidgetId!.startsWith('footer_')) {
          _selectedWidgetId = null;
        }
      });
    }

    _loadedFooterCanvasSizeSegment = canvasSizeSegment;
    _footerLayoutsResolved = false;

    final result = await _getFooterTemplates(
      GetFooterTemplatesParams(
        canvasSizeSegment: canvasSizeSegment,
        forceRefresh: force,
      ),
    );
    result.fold(
      (failure) {
        // debugPrint('Footer frame load failed: ${failure.message}');
        _footerLayoutsResolved = true;
        _tryCaptureOriginalBaseline();
      },
      (List<Map<String, dynamic>> rawList) {
        if (rawList.isEmpty || !mounted) {
          _footerLayoutsResolved = true;
          _tryCaptureOriginalBaseline();
          return;
        }
        // debugPrint(
          // 'FOOTER_DEBUG: Footer API returned ${rawList.length} templates',
        // );
        unawaited(_loadFooterTemplateLayouts(rawList));
        final String firstThumb = _footerThumbnailUrl(rawList.first);
        if (firstThumb.isEmpty) return;
        final bool hasExistingSelection =
            _selectedFrame != null && _selectedFrame != 'none';
        if (hasExistingSelection) return;
        // debugPrint('FOOTER_DEBUG: Setting default selection to $firstThumb');
        setState(() {
          _selectedFrame = firstThumb;
        });
      },
    );
  }

  String _footerThumbnailUrl(Map<String, dynamic> raw) {
    final Object? v =
        raw['thumbnailUrl'] ??
        raw['thumbnail'] ??
        raw['image'] ??
        raw['backgroundUrl'];
    return v?.toString().trim() ?? '';
  }

  Future<void> _loadFooterTemplateLayouts(
    List<Map<String, dynamic>> rawFooters,
  ) async {
    final Map<String, Map<String, dynamic>> catalog =
        <String, Map<String, dynamic>>{};
    final Map<String, Map<String, dynamic>> immediate =
        <String, Map<String, dynamic>>{};
    final List<String> unresolvedTemplateIds = <String>[];

    for (final Map<String, dynamic> raw in rawFooters) {
      final String templateId = (raw['id'] ?? '').toString();
      if (templateId.isEmpty) continue;
      catalog[templateId] = Map<String, dynamic>.from(raw);
      final Map<String, dynamic>? layout = _extractLayoutByAspectRatio(
        Map<String, dynamic>.from(raw),
      );
      if (layout != null) {
        immediate[templateId] = layout;
      } else {
        unresolvedTemplateIds.add(templateId);
      }
    }
    if (!mounted) return;
    final Map<String, Map<String, dynamic>> mergedLayouts =
        Map<String, Map<String, dynamic>>.from(immediate);
    final String? seededFooterId =
        _seedFooterLayoutJson?['id']?.toString().trim();
    if (seededFooterId != null &&
        seededFooterId.isNotEmpty &&
        _seedFooterLayoutJson != null) {
      mergedLayouts[seededFooterId] = _seedFooterLayoutJson!;
    }
    setState(() {
      _footerCatalogByTemplateId
        ..clear()
        ..addAll(catalog);
      _footerLayoutByTemplateId
        ..clear()
        ..addAll(mergedLayouts);
    });

    Map<String, dynamic>? pickBestRaw(
      Map<String, Map<String, dynamic>> availableLayouts,
    ) {
      if (availableLayouts.isEmpty) return null;
      final String preferredId = _pendingInitialFooterTemplateId?.trim() ?? '';
      if (preferredId.isNotEmpty && availableLayouts[preferredId] != null) {
        for (final Map<String, dynamic> raw in rawFooters) {
          if ((raw['id'] ?? '').toString() == preferredId) return raw;
        }
      }
        for (final Map<String, dynamic> raw in rawFooters) {
          final String tid = (raw['id'] ?? '').toString();
        final Map<String, dynamic>? layout = availableLayouts[tid];
        if (layout == null) continue;
            final double lw = _asDouble(layout['canvas']?['width']);
            final double lh = _asDouble(layout['canvas']?['height']);
            if ((lw - _canvasSize.width).abs() < 1.0 &&
                (lh - _canvasSize.height).abs() < 1.0) {
          return raw;
        }
      }
      return null;
    }

    if (_selectedFrameJson == null &&
        _selectedFrame != 'none' &&
        mergedLayouts.isNotEmpty) {
      final Map<String, dynamic>? bestRaw = pickBestRaw(mergedLayouts);
      if (bestRaw != null) {
        final String bid = (bestRaw['id'] ?? '').toString();
        final Map<String, dynamic>? layout = mergedLayouts[bid];
        if (layout != null) {
          if (!mounted) return;
          setState(() {
            _selectedFrameJson = layout;
            final String thumb = _footerThumbnailUrl(bestRaw);
            _selectedFrame = thumb.isEmpty ? null : thumb;
            _pendingInitialFooterTemplateId = null;
          });
          _applyFooterLayout(layout);
        }
      }
    }

    final String preferredId = _pendingInitialFooterTemplateId?.trim() ?? '';
    final bool preserveSeededFooter = seededFooterId != null &&
        seededFooterId.isNotEmpty &&
        _seedFooterLayoutJson != null;
    if (preferredId.isNotEmpty && unresolvedTemplateIds.contains(preferredId)) {
      final Map<String, dynamic>? preferredLayout =
          await _fetchTemplateLayoutById(preferredId);
      if (preferredLayout != null && mounted) {
        setState(() {
          if (!preserveSeededFooter || preferredId != seededFooterId) {
            _footerLayoutByTemplateId[preferredId] = preferredLayout;
          }
        });
        if (_selectedFrameJson == null && _selectedFrame != 'none') {
          Map<String, dynamic>? preferredRaw;
          for (final Map<String, dynamic> raw in rawFooters) {
            if ((raw['id'] ?? '').toString() == preferredId) {
              preferredRaw = raw;
              break;
            }
          }
          if (preferredRaw != null) {
            if (!mounted) return;
            setState(() {
              _selectedFrameJson = preferredLayout;
              final String thumb = _footerThumbnailUrl(preferredRaw!);
              _selectedFrame = thumb.isEmpty ? null : thumb;
              _pendingInitialFooterTemplateId = null;
            });
            _applyFooterLayout(preferredLayout);
          }
        }
      }
      unresolvedTemplateIds.remove(preferredId);
    }

    final List<Future<MapEntry<String, Map<String, dynamic>>?>> futures =
        unresolvedTemplateIds.map((String templateId) async {
          final Map<String, dynamic>? layout =
              await _fetchTemplateLayoutById(templateId);
          if (layout == null) return null;
          return MapEntry<String, Map<String, dynamic>>(templateId, layout);
        }).toList();
    final List<MapEntry<String, Map<String, dynamic>>?> fetchedEntries =
        await Future.wait(futures);
    if (!mounted) return;
    setState(() {
      for (final MapEntry<String, Map<String, dynamic>>? entry
          in fetchedEntries) {
        if (entry == null) continue;
        if (preserveSeededFooter && entry.key == seededFooterId) {
          continue;
        }
        _footerLayoutByTemplateId[entry.key] = entry.value;
      }

      if (_selectedFrameJson == null &&
          _selectedFrame != 'none' &&
          _footerLayoutByTemplateId.isNotEmpty) {
        final Map<String, dynamic>? bestRaw =
            pickBestRaw(_footerLayoutByTemplateId);
        if (bestRaw != null) {
          final String bid = (bestRaw['id'] ?? '').toString();
          _selectedFrameJson = _footerLayoutByTemplateId[bid];
          final String thumb = _footerThumbnailUrl(bestRaw);
          _selectedFrame = thumb.isEmpty ? null : thumb;
          _pendingInitialFooterTemplateId = null;
        }
      }
      _footerLayoutsResolved = true;
      _tryCaptureOriginalBaseline();
    });

    if (_selectedFrameJson != null) {
      _applyFooterLayout(_selectedFrameJson);
    }
  }

  void _applyFooterLayout(Map<String, dynamic>? layoutJson) {
    if (layoutJson == null || !mounted) return;

    // Only render footers if the footer size matches the template size
    final canvas = layoutJson['canvas'];
    final double footerW = _asDouble(canvas?['width'], fallback: 1080);
    final double footerH = _asDouble(canvas?['height'], fallback: 1080);

    final bool sizeMatches =
        (footerW - _canvasSize.width).abs() < 1.0 &&
        (footerH - _canvasSize.height).abs() < 1.0;
 
    if (!sizeMatches) {
      // debugPrint(
        // 'FOOTER_DEBUG: Size mismatch. Canvas: ${_canvasSize.width}x${_canvasSize.height}, Footer: ${footerW}x${footerH}. Footer will not be rendered.',
      // );
      setState(() {
        _preparedFooterRenderLayout = null;
        _canvasWidgets.removeWhere((w) => w.isFromFrame);
        if (_selectedWidgetId != null &&
            _selectedWidgetId!.startsWith('footer_')) {
          _selectedWidgetId = null;
        }
      });
      return;
    }


    setState(() {
      // 1. Remove existing frame-based widgets
      _preparedFooterRenderLayout = null;
      _canvasWidgets.removeWhere((w) => w.isFromFrame);
      if (_selectedWidgetId != null &&
          _selectedWidgetId!.startsWith('footer_')) {
        _selectedWidgetId = null;
      }

      final canvas = layoutJson['canvas'];
      final double templateW = _asDouble(canvas?['width'], fallback: 1080);
      final double templateH = _asDouble(canvas?['height'], fallback: 1080);

      final String? footerTemplateId = layoutJson['id']?.toString();
      final Map<String, dynamic>? footerTemplate = footerTemplateId != null
          ? _footerCatalogByTemplateId[footerTemplateId]
          : null;

      _preparedFooterRenderLayout = FooterVirtualCanvas.prepareRenderLayout(
        layoutJson: layoutJson,
        businessProfile: _businessProfile,
        businessLogoUrl: _resolveBusinessLogoUrl(),
        businessUserPhotoUrl: _resolveBusinessUserPhotoUrl(),
        footerTemplate: footerTemplate,
        isTemplateDetailsScreen: true,
      );

      final List<dynamic> boundLayers =
          (_preparedFooterRenderLayout?['layers'] as List<dynamic>?) ?? [];
      final footerWidgets = _mapTemplateLayersToWidgets(
        boundLayers,
        isFromFrame: true,
      );

      // 3. Scale widgets if template resolution differs from canvas resolution

      if (templateW != _canvasSize.width || templateH != _canvasSize.height) {
        final double scaleX = _canvasSize.width / templateW;
        final double scaleY = _canvasSize.height / templateH;

        for (var widget in footerWidgets) {
          widget.position = Offset(
            widget.position.dx * scaleX,
            widget.position.dy * scaleY,
          );
          if (widget.boxWidth != null)
            widget.boxWidth = widget.boxWidth! * scaleX;
          if (widget.boxHeight != null)
            widget.boxHeight = widget.boxHeight! * scaleY;
          widget.fontSize *= scaleX;
          widget.letterSpacing *= scaleX;
          widget.baselineShift *= scaleY;
          widget.baselineShiftXScale = scaleX / scaleY;
          widget.frameId = layoutJson['id']?.toString(); // Group by footer ID

          // Ensure footer widgets have a z-index that keeps them on top of most template layers
          if (widget.zIndex < 100) {
            widget.zIndex += 1000;
          }
        }
      } else {
        // Even if no scaling, ensure footer widgets are on top
        for (var widget in footerWidgets) {
          if (widget.zIndex < 100) {
            widget.zIndex += 1000;
          }
        }
      }

      // 4. Add to canvas and sort
      _canvasWidgets.addAll(footerWidgets);
      _canvasWidgets.sort((a, b) => a.zIndex.compareTo(b.zIndex));
      // debugPrint(
        // 'FOOTER_DEBUG: Applied ${footerWidgets.length} widgets to canvas. Total widgets: ${_canvasWidgets.length}',
      // );
      _saveState();
    });

    // Prefetch for the new widgets
    final footerWidgets = _canvasWidgets.where((w) => w.isFromFrame).toList();
    unawaited(_prefetchTemplateFonts(footerWidgets));
    _prefetchTemplateImages(footerWidgets, _templateLoadVersion);
    _prefetchImageSourceDimensions(footerWidgets);
  }

  Widget _buildFooterVirtualCanvasOverlay() {
    final Map<String, dynamic>? layoutJson = _selectedFrameJson;
    if (layoutJson == null) {
      return const SizedBox.shrink();
    }

    // Map current color updates from _canvasWidgets back into the JSON layout before rendering
    final Map<String, dynamic> updatedLayoutJson = Map<String, dynamic>.from(layoutJson);
    final List<dynamic> rawLayers = updatedLayoutJson['layers'] is List ? updatedLayoutJson['layers'] : [];
    final List<dynamic> updatedLayers = [];

    for (final dynamic rawLayer in rawLayers) {
      if (rawLayer is Map<String, dynamic>) {
        final Map<String, dynamic> layer = Map<String, dynamic>.from(rawLayer);
        final String rawLayerId = layer['id']?.toString() ?? '';
        final String canvasWidgetId = 'footer_$rawLayerId';

        final int idx = _canvasWidgets.indexWhere((w) => w.id == canvasWidgetId);
        if (idx >= 0) {
          final CanvasWidget w = _canvasWidgets[idx];
          
          // Color & Background
          layer['color'] = '#${w.color.value.toRadixString(16).padLeft(8, '0').substring(2).toUpperCase()}';
          if (w.backgroundColor != null) {
            layer['fillColor'] = '#${w.backgroundColor!.value.toRadixString(16).padLeft(8, '0').substring(2).toUpperCase()}';
          }
          layer['opacity'] = w.opacity;

          // Position & Size
          layer['x'] = w.position.dx;
          layer['y'] = w.position.dy;
          if (w.boxWidth != null) layer['w'] = w.boxWidth;
          if (w.boxHeight != null) layer['h'] = w.boxHeight;

          // Geometry
          layer['scale'] = w.scale;
          layer['rotation'] = w.rotation * (180.0 / pi); // Rad to deg

          // Text Properties
          if (w.type == CanvasWidgetType.text) {
            if (w.text != null) {
              layer['text'] = w.text;
              layer['value'] = w.text;
            }
            layer['fontSize'] = w.fontSize;
            if (w.fontFamily != null) {
              layer['fontFamily'] = w.fontFamily;
            }
            layer['letterSpacing'] = w.letterSpacing;
            layer['letterSpacingPx'] = w.letterSpacing;
            if (w.lineHeight != null) {
              layer['lineHeight'] = w.lineHeight! * w.fontSize;
              layer['lineHeightPx'] = w.lineHeight! * w.fontSize;
            }
            layer['textAlign'] = w.textAlign.name;
            layer['fontWeight'] = w.fontWeight?.toString().replaceAll('FontWeight.w', '') ?? 'normal';
            layer['fontStyle'] = w.fontStyle?.name ?? 'normal';
          }
        }
        updatedLayers.add(layer);
      } else {
        updatedLayers.add(rawLayer);
      }
    }
    updatedLayoutJson['layers'] = updatedLayers;

    final String? footerTemplateId = updatedLayoutJson['id']?.toString();
    final Map<String, dynamic>? footerTemplate = footerTemplateId != null
        ? _footerCatalogByTemplateId[footerTemplateId]
        : null;

    final String? selectedLayerId = (_selectedWidgetId != null && _selectedWidgetId!.startsWith('footer_'))
        ? _selectedWidgetId!.replaceFirst('footer_', '')
        : _selectedWidgetId;

    // Visual-only footer: must not absorb pointer events or template layers
    // underneath become untappable (especially when the logo sits high on
    // square 1080x1080 footers and the clip band covers most of the canvas).
    return Positioned.fill(
      child: IgnorePointer(
        child: FooterVirtualCanvas(
          layoutJson: updatedLayoutJson,
          businessProfile: _businessProfile,
          businessLogoUrl: _resolveBusinessLogoUrl(),
          businessUserPhotoUrl: _resolveBusinessUserPhotoUrl(),
          footerTemplate: footerTemplate,
          isTemplateDetailsScreen: true,
          selectedLayerId: selectedLayerId,
        ),
      ),
    );
  }

  Future<Map<String, dynamic>?> _fetchTemplateLayoutById(
    String templateId,
  ) async {
    try {
      final result = await _getEnrichedTemplateJson(
        GetEnrichedTemplateJsonParams(templateId: templateId),
      );
      return result.fold(
        (failure) {
          // debugPrint(
            // 'FOOTER_DEBUG: Enriched template fetch failed for $templateId: '
            // '${failure.message}',
          // );
          return null;
        },
        _extractLayoutByAspectRatio,
      );
    } catch (e) {
      // debugPrint('FOOTER_DEBUG: Fetch error for $templateId: $e');
      return null;
    }
  }

  Map<String, dynamic>? _extractLayoutByAspectRatio(
    Map<String, dynamic> templateJson,
  ) {
    final dynamic variantsRaw = templateJson['variants'];
    if (variantsRaw is! List || variantsRaw.isEmpty) {
      // debugPrint('FOOTER_DEBUG: No variants found in JSON');
      return null;
    }

    final double targetWidth = _canvasSize.width;
    final double targetHeight = _canvasSize.height;
    final double targetAr = targetWidth / targetHeight;

    // debugPrint(
      // 'FOOTER_DEBUG: Searching for best variant for size ${targetWidth}x${targetHeight} (AR: $targetAr)',
    // );

    for (final dynamic v in variantsRaw) {
      if (v is! Map<String, dynamic>) continue;

      final String? sizeStr = v['size']?.toString();
      if (sizeStr != null) {
        final List<String> parts = sizeStr.split(RegExp(r'[x*×]'));
        if (parts.length == 2) {
          final double vw = double.tryParse(parts[0].trim()) ?? 0.0;
          final double vh = double.tryParse(parts[1].trim()) ?? 0.0;
          if ((vw - targetWidth).abs() < 1.0 &&
              (vh - targetHeight).abs() < 1.0) {
            // debugPrint(
              // 'FOOTER_DEBUG: Found exact size match variant: $sizeStr',
            // );
            final Map<String, dynamic>? layout =
                _extractMatchingLayoutFromVariant(
              v,
              targetWidth,
              targetHeight,
              targetAr,
            );
            if (layout != null) return layout;
          }
        }
      }

      final Map<String, dynamic>? layout = _extractMatchingLayoutFromVariant(
        v,
        targetWidth,
        targetHeight,
        targetAr,
      );
      if (layout != null) return layout;
    }

    // debugPrint(
      // 'FOOTER_DEBUG: No footer layout matching ${targetWidth}x$targetHeight',
    // );
    return null;
  }

  Map<String, dynamic>? _extractMatchingLayoutFromVariant(
    Map<String, dynamic> variant,
    double targetWidth,
    double targetHeight,
    double targetAr,
  ) {
    final dynamic document = variant['document'];
    if (document is! Map<String, dynamic>) return null;
    final dynamic layoutsRaw = document['layouts'];
    if (layoutsRaw is! Map<String, dynamic> || layoutsRaw.isEmpty) {
      return null;
    }

    final List<String> preference = targetAr < 0.9
        ? <String>['vertical', 'portrait', 'story', 'square', 'landscape']
        : <String>['square', 'landscape', 'horizontal', 'vertical', 'portrait'];

    for (final String key in preference) {
      final dynamic chosenLayout = layoutsRaw[key];
      if (chosenLayout is! Map<String, dynamic>) continue;

      final Map<String, dynamic>? layout = _footerLayoutIfSizeMatches(
        chosenLayout,
        targetWidth,
        targetHeight,
        variant['id'],
        layoutKey: key,
      );
      if (layout != null) return layout;
    }

    for (final dynamic chosenLayout in layoutsRaw.values) {
      if (chosenLayout is! Map<String, dynamic>) continue;
      final Map<String, dynamic>? layout = _footerLayoutIfSizeMatches(
        chosenLayout,
        targetWidth,
        targetHeight,
        variant['id'],
      );
      if (layout != null) return layout;
    }

    return null;
  }

  Map<String, dynamic>? _footerLayoutIfSizeMatches(
    Map<String, dynamic> chosenLayout,
    double targetWidth,
    double targetHeight,
    dynamic variantId, {
    String? layoutKey,
  }) {
    final dynamic canvas = chosenLayout['canvas'];
    final dynamic layers = chosenLayout['layers'];
    if (canvas is! Map<String, dynamic> || layers is! List) return null;

    final double footerW = _asDouble(canvas['width']);
    final double footerH = _asDouble(canvas['height']);
    if ((footerW - targetWidth).abs() >= 1.0 ||
        (footerH - targetHeight).abs() >= 1.0) {
      return null;
    }

    if (layoutKey != null) {
      // debugPrint('FOOTER_DEBUG: Selected layout by key: $layoutKey');
    }
    // debugPrint(
      // 'FOOTER_DEBUG: Matched footer layout ${footerW}x$footerH for variant $variantId (${layers.length} layers)',
    // );
    final List<Map<String, dynamic>> fixedLayers = <Map<String, dynamic>>[];
    for (final dynamic rawLayer in layers) {
      if (rawLayer is! Map<String, dynamic>) continue;
      final Map<String, dynamic> fixed =
          Map<String, dynamic>.from(rawLayer);
      TemplateLayerGeometryParser.normalizeEditorVisibility(fixed);
      fixedLayers.add(FooterBusinessProfileBinder.fixLayerGeometry(fixed));
    }
    TemplateLayerGeometryParser.normalizeClipMaskCornerRadii(fixedLayers);

    return <String, dynamic>{
      'canvas': Map<String, dynamic>.from(canvas),
      'layers': fixedLayers,
      if (variantId != null) 'id': variantId.toString(),
    };
  }

  @override
  void dispose() {
    _canvasCubit.close();
    _safeCloseBottomSheetController();
    _livePickerColor.dispose();
    _audioSubscription?.cancel();
    _audioPlayer.dispose();
    _trimmerScrollController.dispose();
    _initialVideoController?.dispose();
    for (var controller in _stickerVideoControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  bool get _hasOpenBottomSheet =>
      _isEditingBottomSheetOpen ||
      _isColorPickerSheetOpen ||
      _activePersistentBottomSheetController != null ||
      _hasManagedModalBottomSheetOpen;

  void _safeCloseBottomSheetController() {
    try {
      _activePersistentBottomSheetController?.close();
    } catch (_) {
      // Safe to ignore if bottom sheet is already closed or Scaffold key is null
    }
    _activePersistentBottomSheetController = null;
  }

  Future<void> _dismissActiveBottomSheets() async {
    if (_isDismissingBottomSheets) return;
    _isDismissingBottomSheets = true;
    try {
      if (_hasManagedModalBottomSheetOpen && mounted) {
        Navigator.of(context, rootNavigator: true).pop();
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      _safeCloseBottomSheetController();
    } finally {
      _isEditingBottomSheetOpen = false;
      _textEditSheetSetState = null;
      _isColorPickerSheetOpen = false;
      _colorPickerTargetWidgetId = null;
      _isColorPencilVisible = false;
      _isDismissingBottomSheets = false;
    }
  }

  void _handleEmptySpaceTap() {
    if (_isColorPencilVisible) {
      return;
    }
    if (_hasOpenBottomSheet) {
      unawaited(_dismissActiveBottomSheets());
      return;
    }
    if (_canvasCubit.isInteractionLocked) {
      return;
    }
    setState(() => _selectedWidgetId = null);
  }

  Future<T?> _showManagedModalBottomSheet<T>({
    required BuildContext context,
    required WidgetBuilder builder,
    Color? backgroundColor,
    ShapeBorder? shape,
    bool isScrollControlled = false,
    bool isDismissible = true,
    bool enableDrag = true,
    bool useRootNavigator = false,
    Color? barrierColor,
    bool dismissActiveSheets = true,
  }) async {
    if (dismissActiveSheets) {
      await _dismissActiveBottomSheets();
    }
    if (!mounted) return null;
    _hasManagedModalBottomSheetOpen = true;

    final Color resolvedBackground = backgroundColor ?? Colors.white;
    final ShapeBorder resolvedShape = shape ??
        const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        );

    try {
      return await showModalBottomSheet<T>(
        context: context,
        builder: builder,
        backgroundColor: resolvedBackground,
        shape: resolvedShape,
        isScrollControlled: isScrollControlled,
        isDismissible: isDismissible,
        enableDrag: enableDrag,
        useRootNavigator: useRootNavigator,
        barrierColor: barrierColor,
      );
    } finally {
      _hasManagedModalBottomSheetOpen = false;
    }
  }

  void _notifyTextEditSheet() {
    if (!_isEditingBottomSheetOpen) return;
    final StateSetter? refresh = _textEditSheetSetState;
    if (refresh == null) return;
    refresh(() {});
  }

  void _applyTextWidgetColor(CanvasWidget widget, Color color) {
    if (!mounted) return;
    setState(() {
      if (widget.isFromFrame && widget.isShapeRasterLayer) {
        final String? frameId = widget.frameId;
        for (int i = 0; i < _canvasWidgets.length; i++) {
          final CanvasWidget w = _canvasWidgets[i];
          if (!w.isShapeRasterLayer || !w.isFromFrame) continue;
          if (frameId != null &&
              w.frameId != null &&
              w.frameId != frameId) {
            continue;
          }
          w.color = color;
        }
      } else {
        widget.color = color;
      }
    });
    _notifyTextEditSheet();
  }

  ImageProvider _getImageProvider(String path) {
    if (path.isEmpty) {
      return const AssetImage(
        'assets/images/placeholder.png',
      ); // Fallback if needed
    }
    if (path.startsWith('http')) {
      return NetworkImage(path);
    }
    // If it's an absolute path, it's a local file.
    // Absolute paths on Android/iOS start with '/',
    // on Windows they start with drive letter like 'C:\'.
    if (File(path).isAbsolute) {
      return FileImage(File(path));
    }
    // Otherwise, assume it's a bundled asset
    return AssetImage(path);
  }

  Color _parseColor(dynamic colorData) {
    if (colorData == null) return Colors.transparent;

    if (colorData is Map) {
      // Handle HSB (common in Photoshop exports)
      final h = _asDouble(colorData['h'] ?? colorData['hue']);
      final s = _asDouble(colorData['s'] ?? colorData['saturation']);
      final b = _asDouble(
        colorData['b'] ?? colorData['brightness'] ?? colorData['value'],
      );

      if (colorData.containsKey('h') || colorData.containsKey('hue')) {
        // Photoshop HSB is usually H: 0-360, S: 0-100, B: 0-100
        return HSVColor.fromAHSV(
          1.0,
          h.clamp(0.0, 360.0),
          (s / 100.0).clamp(0.0, 1.0),
          (b / 100.0).clamp(0.0, 1.0),
        ).toColor();
      }

      // Handle raw RGB object
      final r = _asDouble(colorData['r'] ?? colorData['red']);
      final g = _asDouble(colorData['g'] ?? colorData['green']);
      final bl = _asDouble(colorData['b'] ?? colorData['blue']);
      if (colorData.containsKey('r') || colorData.containsKey('red')) {
        return Color.fromARGB(
          255,
          r.toInt().clamp(0, 255),
          g.toInt().clamp(0, 255),
          bl.toInt().clamp(0, 255),
        );
      }
    }

    final String colorStr = colorData.toString().trim();
    if (colorStr.isEmpty) return Colors.transparent;

    try {
      if (colorStr.startsWith('#')) {
        String hex = colorStr.replaceAll('#', '');
        if (hex.length == 6) hex = 'FF$hex'; // Add opacity if missing
        if (hex.length == 8) return Color(int.parse(hex, radix: 16));
      }
    } catch (e) {
      // debugPrint("Color parse error: $colorStr - $e");
    }
    return Colors.transparent;
  }

  TextAlign _parseTextAlign(String? alignStr) {
    if (alignStr == null) return TextAlign.center;
    switch (alignStr.toLowerCase()) {
      case 'left':
        return TextAlign.left;
      case 'right':
        return TextAlign.right;
      case 'center':
        return TextAlign.center;
      case 'justify':
        return TextAlign.justify;
      default:
        return TextAlign.center;
    }
  }

  FontStyle _parseFontStyle(String? style) {
    final String normalized = (style ?? '').trim().toLowerCase();
    if (normalized == 'italic' || normalized == 'oblique') {
      return FontStyle.italic;
    }
    return FontStyle.normal;
  }

  TextDecoration _parseTextDecoration({
    required dynamic underline,
    required dynamic strikethrough,
  }) {
    final bool hasUnderline =
        underline == true || underline?.toString().toLowerCase() == 'true';
    final bool hasStrikethrough =
        strikethrough == true ||
        strikethrough?.toString().toLowerCase() == 'true';
    if (hasUnderline && hasStrikethrough) {
      return TextDecoration.combine(<TextDecoration>[
        TextDecoration.underline,
        TextDecoration.lineThrough,
      ]);
    }
    if (hasUnderline) return TextDecoration.underline;
    if (hasStrikethrough) return TextDecoration.lineThrough;
    return TextDecoration.none;
  }

  String _applyTextTransform(
    String text,
    String textTransform,
    bool isUpperCase,
  ) {
    if (isUpperCase) return text.toUpperCase();
    switch (textTransform.trim().toLowerCase()) {
      case 'uppercase':
        return text.toUpperCase();
      case 'lowercase':
        return text.toLowerCase();
      case 'capitalize':
        return text.split(RegExp(r'(\s+)')).map((part) {
          if (part.trim().isEmpty) return part;
          return '${part[0].toUpperCase()}${part.substring(1).toLowerCase()}';
        }).join();
      case 'none':
      default:
        return text;
    }
  }

  String _prepareTextForSafeWrapping(String input) {
    if (input.isEmpty) return input;
    final RegExp longToken = RegExp(r'([^\s]{16})(?=[^\s])');
    return input.replaceAllMapped(longToken, (m) => '${m.group(1)}\u200B');
  }

  static const double _kTextBoxFitPadding = 2.0;
  /// Default line-height for one-line strings that visually wrap to multiple rows.
  static const double _kDefaultSoftWrappedLineHeight = 0.9;
  static const TextHeightBehavior _kTightWrappedTextHeightBehavior =
      TextHeightBehavior(
    applyHeightToFirstAscent: false,
    applyHeightToLastDescent: false,
  );

  int _measureVisualLineCount(CanvasWidget widget, String text) {
    final double? boxWidth = widget.boxWidth;
    if (boxWidth == null || boxWidth <= 0) return 1;

    final TextStyle probeStyle = _getSafeTextStyle(
      fontFamily: widget.fontFamily ?? 'Outfit',
      fontSize: widget.fontSize,
      fontWeight: widget.fontWeight,
      fontStyle: widget.fontStyle,
      decoration: widget.decoration,
      color: widget.color,
      letterSpacing: widget.letterSpacing,
    );
    final TextPainter painter = TextPainter(
      text: TextSpan(text: text, style: probeStyle),
      textAlign: widget.textAlign,
      textDirection: TextDirection.ltr,
      maxLines: widget.maxLines ?? (widget.softWrap ? null : 1),
    )..layout(minWidth: 0, maxWidth: boxWidth);
    return painter.computeLineMetrics().length;
  }

  bool _textIsMultiline(CanvasWidget widget, String text) {
    if (text.contains('\n')) return true;
    if (widget.boxWidth == null || widget.boxWidth! <= 0) return false;
    return _measureVisualLineCount(widget, text) > 1;
  }

  bool _isSoftWrappedMultiline(CanvasWidget widget, String text) {
    return !text.contains('\n') && _textIsMultiline(widget, text);
  }

  /// Keeps slider + render at 0.9× until the user moves the line-height slider.
  void _syncDefaultLineHeight(CanvasWidget widget) {
    if (widget.isFromFrame) return;
    if (widget.type != CanvasWidgetType.text || widget.lineHeightCustomized) {
      return;
    }
    widget.lineHeight = _kDefaultSoftWrappedLineHeight;
  }

  /// Template JSON `w` is an alignment span only — text paints at intrinsic size.
  bool _templateTextUsesIntrinsicSize(CanvasWidget widget) {
    return false;
  }

  /// Horizontal offset within authored JSON `w` without a fixed-size box.
  double _templateTextAlignOffsetX(CanvasWidget widget, double textWidth) {
    final double? spanW = widget.boxWidth;
    if (spanW == null || spanW <= 0) return 0;
    switch (widget.textAlign) {
      case TextAlign.center:
        return (spanW - textWidth) / 2;
      case TextAlign.right:
      case TextAlign.end:
        return spanW - textWidth;
      default:
        return 0;
    }
  }

  /// Resolved baselineShift offset (X uses [baselineShiftXScale] when scaled).
  Offset _canvasWidgetBaselineShiftOffset(CanvasWidget widget) {
    final double yShift = widget.baselineShift;
    if (yShift == 0) return Offset.zero;
    return Offset(yShift * widget.baselineShiftXScale, yShift);
  }

  Widget _applyWidgetBaselineShift(Widget child, CanvasWidget widget) {
    final Offset offset = _canvasWidgetBaselineShiftOffset(widget);
    if (offset == Offset.zero) return child;
    return Transform.translate(offset: offset, child: child);
  }

  /// Resolves line-height for template breaks vs soft-wrapped multi-line text.
  ({double? height, TextHeightBehavior? textHeightBehavior})
      _resolveTextTypography(CanvasWidget widget, String text) {
    if (widget.isFromFrame) {
      final bool isMultiline = text.contains('\n') ||
          widget.role == FooterBusinessProfileBinder.addressFieldId;
      final double? heightFactor = widget.height ??
          (isMultiline && widget.lineHeight > 0 ? widget.lineHeight : null);
      return (height: heightFactor, textHeightBehavior: null);
    }

    _syncDefaultLineHeight(widget);

    if (!widget.lineHeightCustomized) {
      return (
        height: _kDefaultSoftWrappedLineHeight,
        textHeightBehavior: _isSoftWrappedMultiline(widget, text)
            ? _kTightWrappedTextHeightBehavior
            : null,
      );
    }

    return (height: widget.lineHeight, textHeightBehavior: null);
  }

  double _textBottomLayoutPadding(TextStyle style) {
    final double fontSize = style.fontSize ?? 14.0;
    return max(_kTextBoxFitPadding, fontSize * 0.06);
  }

  double _textPainterLayoutHeight(TextPainter painter, TextStyle style) {
    final List<LineMetrics> lines = painter.computeLineMetrics();
    if (lines.isEmpty) {
      return painter.size.height + _textBottomLayoutPadding(style);
    }
    double paintedBottom = 0;
    for (final LineMetrics line in lines) {
      paintedBottom = max(paintedBottom, line.baseline + line.descent);
    }
    return paintedBottom + _textBottomLayoutPadding(style);
  }

  TextStyle _fitTextStyleToLayerBox({
    required String text,
    required TextStyle baseStyle,
    required double boxWidth,
    required double boxHeight,
    required TextAlign textAlign,
  }) {
    if (text.isEmpty || boxWidth <= 0 || boxHeight <= 0) return baseStyle;
    final double baseFontSize = baseStyle.fontSize ?? 14;
    if (baseFontSize <= 0) return baseStyle;
    double min = 1.0;
    double max = baseFontSize;
    TextStyle best = baseStyle;

    bool fits(double size) {
      final double scale = size / baseFontSize;
      final TextStyle candidate = baseStyle.copyWith(
        fontSize: size,
        letterSpacing: (baseStyle.letterSpacing ?? 0) * scale,
      );
      final TextPainter painter = TextPainter(
        text: TextSpan(text: text, style: candidate),
        textAlign: textAlign,
        textDirection: TextDirection.ltr,
        maxLines: null,
      )..layout(minWidth: 0, maxWidth: boxWidth);
      if (painter.size.width - boxWidth > 0.1) return false;
      if (painter.size.height - boxHeight > 0.1) return false;
      return true;
    }

    for (int i = 0; i < 12; i++) {
      final double mid = (min + max) / 2;
      if (fits(mid)) {
        best = baseStyle.copyWith(
          fontSize: mid,
          letterSpacing: (baseStyle.letterSpacing ?? 0) * (mid / baseFontSize),
        );
        min = mid;
      } else {
        max = mid;
      }
    }
    return best;
  }

  String _textPreviewForLayout(CanvasWidget widget) {
    return _prepareTextForSafeWrapping(
      _applyTextTransform(
        widget.text ?? 'Text',
        widget.textTransform,
        widget.isUpperCase,
      ),
    );
  }

  TextStyle _textStyleForLayout(
    CanvasWidget widget,
    String text, {
    bool applyAutoFit = true,
  }) {
    final ({double? height, TextHeightBehavior? textHeightBehavior}) typography =
        _resolveTextTypography(widget, text);
    TextStyle style = _getSafeTextStyle(
      fontFamily: widget.fontFamily ?? 'Outfit',
      fontSize: widget.fontSize,
      height: typography.height,
      fontWeight: widget.fontWeight,
      fontStyle: widget.fontStyle,
      decoration: widget.decoration,
      color: widget.color,
      letterSpacing: widget.letterSpacing,
      shadows: widget.hasShadow
          ? [
              Shadow(
                blurRadius: 2.0,
                color: Colors.black.withOpacity(0.3),
                offset: const Offset(1, 1),
              ),
            ]
          : null,
    );
    if (applyAutoFit &&
        widget.isAutoFitText &&
        widget.boxWidth != null &&
        widget.boxHeight != null) {
      style = _fitTextStyleToLayerBox(
        text: text,
        baseStyle: style,
        boxWidth: widget.boxWidth!,
        boxHeight: widget.boxHeight!,
        textAlign: widget.textAlign,
      );
    }
    return style;
  }

  TextPainter _layoutTextPainter(
    CanvasWidget widget,
    String text, {
    bool intrinsicWidth = false,
  }) {
    final bool wrapInBox = widget.softWrap || text.contains('\n');
    final TextStyle style = _textStyleForLayout(
      widget,
      text,
      applyAutoFit: !intrinsicWidth,
    );
    final double maxWidth = intrinsicWidth
        ? (wrapInBox && widget.boxWidth != null
            ? widget.boxWidth!
            : (text.contains('\n')
                ? (widget.boxWidth ?? _canvasSize.width)
                : double.infinity))
        : ((widget.boxWidth != null && !widget.isFromFrame)
            ? widget.boxWidth!
            : (wrapInBox ? _canvasSize.width : double.infinity));
    return TextPainter(
          text: TextSpan(text: text, style: style),
          textAlign: widget.textAlign,
          textDirection: TextDirection.ltr,
      maxLines: widget.maxLines ?? (widget.softWrap ? null : 1),
    )..layout(minWidth: 0, maxWidth: maxWidth);
  }

  Size _measureRenderedTextSize(CanvasWidget widget, String text) {
    return _layoutTextPainter(widget, text).size;
  }

  Size _measureIntrinsicTextSize(CanvasWidget widget, String text) {
    return _layoutTextPainter(widget, text, intrinsicWidth: true).size;
  }

  /// Ensures a fixed-size text layer box is tall/wide enough for wrapped content.
  void _ensureTextBoxFitsWrappedContent(CanvasWidget widget) {
    if (widget.isFromFrame) return;
    if (widget.type != CanvasWidgetType.text) return;
    // Template text renders at intrinsic size; JSON w/h are not layout boxes.
    if (_templateTextUsesIntrinsicSize(widget)) return;
    if (widget.warp != null && widget.warp!['style'] == 'arc') return;
    if (widget.boxWidth == null || widget.boxWidth! <= 0) return;

    final String previewText = _textPreviewForLayout(widget);
    final TextPainter painter = _layoutTextPainter(widget, previewText);
    final TextStyle style = _textStyleForLayout(widget, previewText);
    final double neededHeight = _textPainterLayoutHeight(painter, style);

    if (widget.boxHeight == null || widget.boxHeight! + 0.5 < neededHeight) {
      widget.boxHeight = neededHeight.clamp(1.0, _canvasSize.height);
    }
  }

  void _refitAllTextLayerBoxes(Iterable<CanvasWidget> widgets) {
    for (final CanvasWidget widget in widgets) {
      if (widget.isFromFrame || widget.type != CanvasWidgetType.text) continue;
      _syncDefaultLineHeight(widget);
      _ensureTextBoxFitsWrappedContent(widget);
    }
  }

  /// Expands the text layer box when content grows (e.g. 1 → 2 digits).
  void _resizeTextBoxToFitContent(CanvasWidget widget) {
    if (widget.type != CanvasWidgetType.text) return;
    if (widget.warp != null && widget.warp!['style'] == 'arc') return;

    final double oldWidth = widget.boxWidth ?? 0.0;
    final double oldHeight = widget.boxHeight ?? 0.0;
    final Offset oldCenter = Offset(
      widget.position.dx + (oldWidth > 0 ? oldWidth : 0) / 2,
      widget.position.dy + (oldHeight > 0 ? oldHeight : 0) / 2,
    );

    _ensureTextBoxFitsWrappedContent(widget);

    final double newWidth = widget.boxWidth ?? oldWidth;
    final double newHeight = widget.boxHeight ?? oldHeight;

    if (oldWidth > 0 && oldHeight > 0) {
      widget.position = Offset(
        oldCenter.dx - newWidth / 2,
        oldCenter.dy - newHeight / 2,
      );
      _clampWidgetInCanvas(widget);
    }
  }

  /// Painted glyph bounds inside the text layer stack (not the full JSON box).
  ({Size size, Offset offset}) _textContentSelectionBounds(CanvasWidget widget) {
    if (widget.warp != null && widget.warp!['style'] == 'arc') {
      final double w = widget.boxWidth ?? 300;
      final double h = widget.boxHeight ?? 100;
      return (size: Size(w, h), offset: Offset.zero);
    }

    final String text = _textPreviewForLayout(widget);
    final TextPainter painter = _layoutTextPainter(widget, text);
    final Size contentSize = painter.size;

    final bool useIntrinsicTemplateText = _templateTextUsesIntrinsicSize(widget);
    final bool hasFixedLayerSize = !useIntrinsicTemplateText &&
        widget.boxWidth != null &&
        widget.boxHeight != null;
    final EdgeInsets layerPadding = EdgeInsets.zero;

    final double layerW = widget.isFromFrame
        ? contentSize.width
        : (useIntrinsicTemplateText
            ? (widget.boxWidth ?? contentSize.width)
            : (widget.boxWidth ??
                (contentSize.width + layerPadding.horizontal)));

    double offsetX = layerPadding.left;
    if (useIntrinsicTemplateText) {
      offsetX = _templateTextAlignOffsetX(widget, contentSize.width);
    } else {
      switch (widget.textAlign) {
        case TextAlign.right:
        case TextAlign.end:
          offsetX = layerW - contentSize.width - layerPadding.right;
          break;
        case TextAlign.center:
          offsetX = (layerW - contentSize.width) / 2;
          break;
        default:
          offsetX = layerPadding.left;
          break;
      }
    }
    final Offset baselineOffset = _canvasWidgetBaselineShiftOffset(widget);
    offsetX += baselineOffset.dx;

    double offsetY = layerPadding.top + baselineOffset.dy;

    return (
      size: Size(contentSize.width, contentSize.height),
      offset: Offset(offsetX, offsetY),
    );
  }

  String _imageSourceDimensionKey(CanvasWidget widget) {
    return '${widget.id}|${widget.imagePath ?? ''}';
  }

  bool _isCircleLogoShape(CanvasWidget widget) {
    return _layerShapeIsEllipse(widget.shape);
  }

  Size? _imageSourceSize(CanvasWidget widget) {
    return _imageSourceDimensions[_imageSourceDimensionKey(widget)];
  }

  Size _imagePaintedSizeInBox({
    required double boxW,
    required double boxH,
    required BoxFit fit,
    required double intrinsicW,
    required double intrinsicH,
  }) {
    if (boxW <= 0 || boxH <= 0 || intrinsicW <= 0 || intrinsicH <= 0) {
      return Size(boxW > 0 ? boxW : 100, boxH > 0 ? boxH : 100);
    }

    switch (fit) {
      case BoxFit.fill:
      case BoxFit.cover:
        return Size(boxW, boxH);
      case BoxFit.contain:
      case BoxFit.scaleDown:
        final double scale = min(boxW / intrinsicW, boxH / intrinsicH);
        final double appliedScale = fit == BoxFit.scaleDown && scale > 1
            ? 1.0
            : scale;
        return Size(intrinsicW * appliedScale, intrinsicH * appliedScale);
      case BoxFit.fitWidth:
        final double scale = boxW / intrinsicW;
        return Size(boxW, intrinsicH * scale);
      case BoxFit.fitHeight:
        final double scale = boxH / intrinsicH;
        return Size(intrinsicW * scale, boxH);
      case BoxFit.none:
        return Size(
          intrinsicW <= boxW ? intrinsicW : boxW,
          intrinsicH <= boxH ? intrinsicH : boxH,
        );
    }
  }

  Offset _imageAlignedOffsetInBox({
    required double boxW,
    required double boxH,
    required Size paintedSize,
    required Alignment alignment,
  }) {
    final double dx =
        (boxW - paintedSize.width) / 2 +
        alignment.x * (boxW - paintedSize.width) / 2;
    final double dy =
        (boxH - paintedSize.height) / 2 +
        alignment.y * (boxH - paintedSize.height) / 2;
    return Offset(dx, dy);
  }

  /// Visible raster bounds inside the logo layer box (not the full JSON w/h).
  ({Size size, Offset offset}) _imageContentSelectionBounds(
    CanvasWidget widget,
  ) {
    final double boxW = widget.boxWidth ?? 100;
    final double boxH = widget.boxHeight ?? 100;

    if (_isCircleLogoShape(widget)) {
      final double diameter = min(boxW, boxH);
      return (
        size: Size(diameter, diameter),
        offset: Offset((boxW - diameter) / 2, (boxH - diameter) / 2),
      );
    }

    final Size? sourceSize = _imageSourceSize(widget);
    if (sourceSize != null &&
        sourceSize.width > 0 &&
        sourceSize.height > 0 &&
        (widget.boxFit == BoxFit.contain ||
            widget.boxFit == BoxFit.scaleDown ||
            widget.boxFit == BoxFit.fitWidth ||
            widget.boxFit == BoxFit.fitHeight ||
            widget.boxFit == BoxFit.none)) {
      final Size painted = _imagePaintedSizeInBox(
        boxW: boxW,
        boxH: boxH,
        fit: widget.boxFit,
        intrinsicW: sourceSize.width,
        intrinsicH: sourceSize.height,
      );
      return (
        size: painted,
        offset: _imageAlignedOffsetInBox(
          boxW: boxW,
          boxH: boxH,
          paintedSize: painted,
          alignment: widget.alignment,
        ),
      );
    }

    return (size: Size(boxW, boxH), offset: Offset.zero);
  }

  Future<void> _resolveImageSourceDimensions(CanvasWidget widget) async {
    if (widget.type != CanvasWidgetType.logo) return;
    final String? path = widget.imagePath?.trim();
    if (path == null || path.isEmpty) return;

    final String cacheKey = _imageSourceDimensionKey(widget);
    if (_imageSourceDimensions.containsKey(cacheKey)) return;

    try {
      Size? resolved;
      if (!path.startsWith('http') && File(path).isAbsolute) {
        final img.Image? decoded = await img.decodeImageFile(path);
        if (decoded != null) {
          resolved = Size(
            decoded.width.toDouble(),
            decoded.height.toDouble(),
          );
        }
      } else {
        final ImageStream stream = _getImageProvider(path).resolve(
          createLocalImageConfiguration(context),
        );
        final Completer<Size> completer = Completer<Size>();
        late ImageStreamListener listener;
        listener = ImageStreamListener(
          (ImageInfo info, bool _) {
            if (!completer.isCompleted) {
              completer.complete(
                Size(
                  info.image.width.toDouble(),
                  info.image.height.toDouble(),
                ),
              );
            }
            stream.removeListener(listener);
          },
          onError: (Object _, StackTrace? __) {
            if (!completer.isCompleted) {
              completer.complete(const Size(0, 0));
            }
            stream.removeListener(listener);
          },
        );
        stream.addListener(listener);
        resolved = await completer.future.timeout(
          const Duration(seconds: 12),
          onTimeout: () => const Size(0, 0),
        );
        if (resolved.width <= 0 || resolved.height <= 0) {
          resolved = null;
        }
      }

      if (resolved != null && mounted) {
        setState(() {
          _imageSourceDimensions[cacheKey] = resolved!;
        });
      }
    } catch (_) {
      // Keep full layer-box selection when dimensions are unavailable.
    }
  }

  Future<void> _prefetchImageSourceDimensions(
    Iterable<CanvasWidget> widgets,
  ) async {
    for (final CanvasWidget widget in widgets) {
      if (widget.type != CanvasWidgetType.logo) continue;
      await _resolveImageSourceDimensions(widget);
    }
  }

  LinearGradient? _parseLayerLinearGradient(Map<String, dynamic> layer) {
    // Check multiple possible locations for gradient data in various JSON formats
    dynamic gData = layer['gradientFill'];
    if (gData == null || gData is! Map) {
      gData = layer['styles']?['gradientOverlay'];
    }

    if (gData == null || gData is! Map) return null;

    final dynamic gradient = gData['gradient'];
    if (gradient is! Map) return null;

    final dynamic colorsRaw = gradient['colors'];
    if (colorsRaw is! List || colorsRaw.isEmpty) return null;

    final List<Color> colors = <Color>[];
    final List<double> stops = <double>[];
    for (final dynamic item in colorsRaw) {
      if (item is! Map) continue;
      final dynamic rawColor = item['color'];
      final Color color = _parseColor(rawColor);
      // Skip transparent colors that are actually empty
      if (color == Colors.transparent &&
          (rawColor == null || rawColor.toString().isEmpty))
        continue;

      final double location = (_asDouble(item['location']) / 100).clamp(
        0.0,
        1.0,
      );
      colors.add(color);
      stops.add(location);
    }

    if (colors.length < 2) return null;

    final double opacity = _asDouble(
      gData['opacity'],
      fallback: 1.0,
    ).clamp(0.0, 1.0);
    final List<Color> withOpacity = colors
        .map((c) => c.withValues(alpha: c.a * opacity))
        .toList();

    final double angleDeg = _asDouble(gData['angle'], fallback: 90.0);
    final double radians =
        (angleDeg - 90) * pi / 180.0; // Corrected angle conversion for Flutter

    // Calculate begin and end alignments based on the angle
    final Alignment begin = Alignment(cos(radians + pi), sin(radians + pi));
    final Alignment end = Alignment(cos(radians), sin(radians));

    return LinearGradient(
      begin: begin,
      end: end,
      colors: withOpacity,
      stops: stops.length == colors.length ? stops : null,
    );
  }

  List<Shadow>? _parseShadows(dynamic data) {
    if (data == null) return null;
    final List<dynamic> shadowList = data is List ? data : [data];
    final List<Shadow> shadows = [];
    for (final s in shadowList) {
      if (s is! Map) continue;
      final color = _parseColor(s['color']);
      if (color == Colors.transparent) continue;

      final dx = _asDouble(s['x'] ?? s['offsetX']) ?? 0.0;
      final dy = _asDouble(s['y'] ?? s['offsetY']) ?? 0.0;
      final blur = _asDouble(s['blur'] ?? s['blurRadius']) ?? 0.0;

      shadows.add(
        Shadow(color: color, offset: Offset(dx, dy), blurRadius: blur),
      );
    }
    return shadows.isEmpty ? null : shadows;
  }

  FontWeight _parseFontWeight(dynamic weight) {
    if (weight == null) return FontWeight.normal;
    final str = weight.toString().toLowerCase();
    switch (str) {
      case '100':
      case 'thin':
        return FontWeight.w100;
      case '200':
      case 'extralight':
        return FontWeight.w200;
      case '300':
      case 'light':
        return FontWeight.w300;
      case '400':
      case 'regular':
      case 'normal':
        return FontWeight.w400;
      case '500':
      case 'medium':
        return FontWeight.w500;
      case '600':
      case 'semibold':
        return FontWeight.w600;
      case '700':
      case 'bold':
        return FontWeight.w700;
      case '800':
      case 'extrabold':
        return FontWeight.w800;
      case '900':
      case 'black':
        return FontWeight.w900;
      default:
        return FontWeight.normal;
    }
  }

  TextStyle _getSafeTextStyle({
    required String fontFamily,
    double? fontSize,
    double? height,
    FontWeight? fontWeight,
    FontStyle? fontStyle,
    TextDecoration? decoration,
    Color? color,
    double? letterSpacing,
    List<Shadow>? shadows,
  }) {
    // Logic for loading fonts from Google Fonts or local/remote.
    if (_loadedFonts.contains(fontFamily)) {
      return TextStyle(
        fontFamily: _registeredFontFamilies[fontFamily] ?? fontFamily,
        fontSize: fontSize,
        height: height,
        fontWeight: fontWeight,
        fontStyle: fontStyle,
        decoration: decoration,
        color: color,
        letterSpacing: letterSpacing,
        shadows: shadows,
      );
    }

    return TextStyle(
      fontFamily: fontFamily.isEmpty ? 'Outfit' : fontFamily,
      fontSize: fontSize,
      height: height,
      fontWeight: fontWeight,
      fontStyle: fontStyle,
      decoration: decoration,
      color: color,
      letterSpacing: letterSpacing,
      shadows: shadows,
    );
  }

  BlendMode _parseBlendMode(String? mode) {
    final String normalized = (mode ?? 'normal').toLowerCase().replaceAll(
      RegExp(r'[\s_-]'),
      '',
    );
    switch (normalized) {
      case 'lighten':
        return BlendMode.lighten;
      case 'darken':
        return BlendMode.darken;
      case 'colordodge':
        return BlendMode.colorDodge;
      case 'colorburn':
        return BlendMode.colorBurn;
      case 'lineardodge':
      case 'add':
        return BlendMode.plus;
      case 'linearburn':
        return BlendMode.darken;
      case 'multiply':
        return BlendMode.multiply;
      case 'screen':
        return BlendMode.screen;
      case 'overlay':
        return BlendMode.overlay;
      case 'color':
        return BlendMode.color;
      case 'hue':
        return BlendMode.hue;
      case 'saturation':
        return BlendMode.saturation;
      case 'difference':
        return BlendMode.difference;
      case 'exclusion':
        return BlendMode.exclusion;
      case 'softlight':
        return BlendMode.softLight;
      case 'hardlight':
        return BlendMode.hardLight;
      case 'pinlight':
        return BlendMode.lighten;
      case 'vividlight':
        return BlendMode.hardLight;
      case 'normal':
      default:
        return BlendMode.srcOver;
    }
  }

  double _effectiveLayerOpacity(CanvasWidget widget) {
    return (widget.opacity * widget.fillOpacity * widget.blendOpacity)
        .clamp(0.0, 1.0)
        .toDouble();
  }

  /// Keeps resized box dimensions within canvas bounds. Position is not clamped —
  /// layers may be dragged off-canvas and are clipped by the canvas stack.
  void _clampWidgetInCanvas(CanvasWidget widget) =>
      _canvasCubit.clampWidgetInCanvas(widget);

  void _handleInteractiveLayerScaleStart(
    CanvasWidget widget,
    ScaleStartDetails details,
  ) {
    _canvasCubit.handleInteractiveLayerScaleStart(widget);
  }

  void _handleInteractiveLayerScaleUpdate(
    CanvasWidget widget,
    ScaleUpdateDetails details,
  ) {
    _canvasCubit.handleInteractiveLayerScaleUpdate(widget, details);
  }

  void _handleInteractiveLayerScaleEnd(CanvasWidget widget) {
    _canvasCubit.handleInteractiveLayerScaleEnd(widget);
  }

  String? _resolveClippedToLayerId(
    dynamic rawClippedTo, {
    required bool isFromFrame,
  }) {
    final String target = rawClippedTo?.toString().trim() ?? '';
    if (target.isEmpty) return null;
    final String prefix = isFromFrame ? 'footer_' : 'template_';
    if (target.startsWith(prefix)) return target;
    return '$prefix$target';
  }

  ({double width, Color color}) _resolveLayerBorderStyle(
    Map<String, dynamic> layer,
  ) {
    double width = _asDouble(layer['borderWidth']);
    Color color = Colors.transparent;

    final dynamic borderColorRaw = layer['borderColor'];
    if (borderColorRaw != null) {
      color = _parseColor(borderColorRaw);
    }

    final dynamic stroke = layer['stroke'];
    if (stroke is Map) {
      final double strokeWidth = _asDouble(
        stroke['width'] ?? stroke['size'] ?? stroke['weight'],
      );
      if (strokeWidth > 0) {
        width = strokeWidth;
      }
      final dynamic strokeColor = stroke['color'];
      if (strokeColor != null) {
        color = _parseColor(strokeColor);
      }
    }

    final dynamic styles = layer['styles'];
    if (styles is Map) {
      final dynamic strokes = styles['strokes'];
      if (strokes is List && strokes.isNotEmpty) {
        final dynamic first = strokes.first;
        if (first is Map) {
          final double strokeWidth = _asDouble(
            first['width'] ?? first['size'] ?? first['weight'],
          );
          if (strokeWidth > 0) {
            width = strokeWidth;
          }
          final dynamic strokeColor = first['color'];
          if (strokeColor != null) {
            color = _parseColor(strokeColor);
          }
        }
      }
    }

    return (width: width, color: color);
  }

  double? _resolveClipContentPaddingFromLayer(Map<String, dynamic> layer) {
    for (final String key in <String>[
      'clipPadding',
      'clipContentPadding',
      'maskPadding',
      'padding',
    ]) {
      final dynamic raw = layer[key];
      if (raw is num && raw > 0) {
        return raw.toDouble();
      }
    }
    return null;
  }

  double _clipMaskContentPadding(CanvasWidget mask) {
    double padding = 0.0;
    if (mask.clipContentPadding != null && mask.clipContentPadding! > 0) {
      padding += mask.clipContentPadding!;
    }
    if (mask.borderWidth > 0) {
      padding += mask.borderWidth;
    }
    return padding;
  }

  bool _layerShapeIsEllipse(String shape) {
    switch (shape.trim().toLowerCase()) {
      case 'circle':
      case 'ellipse':
        return true;
      default:
        return false;
    }
  }

  BorderRadius? _resolvedLayerCornerRadii(CanvasWidget widget) {
    if (_layerShapeIsEllipse(widget.shape)) return null;
    if (widget.cornerRadii != null) return widget.cornerRadii;
    if (widget.borderRadius > 0) {
      return BorderRadius.circular(widget.borderRadius);
    }
    return null;
  }

  /// JSON may set [borderRadius] on vector `shape: path` masks, not only rectangles.
  bool _layerUsesBorderRadius(CanvasWidget widget) {
    return _resolvedLayerCornerRadii(widget) != null;
  }

  Widget _clipWidgetToLayerMaskShape({
    required CanvasWidget widget,
    required Widget child,
    Rect? maskRect,
  }) {
    final double width = maskRect?.width ?? widget.boxWidth ?? 0;
    final double height = maskRect?.height ?? widget.boxHeight ?? 0;
    final bool isEllipse = _layerShapeIsEllipse(widget.shape);
    final bool hasRadius = _layerUsesBorderRadius(widget) || widget.borderRadius > 0;
    if (width <= 0 || height <= 0 || (!hasRadius && !isEllipse)) {
      return child;
    }
    final Rect rect =
        maskRect ?? Rect.fromLTWH(0, 0, width, height);
    return ClipPath(
      clipBehavior: Clip.antiAlias,
      clipper: _LayerMaskClipper(
        maskRect: rect,
        isEllipse: _layerShapeIsEllipse(widget.shape),
        borderRadius: widget.borderRadius,
        cornerRadii: widget.cornerRadii,
      ),
      child: child,
    );
  }

  Rect _clipMaskContentRect(Rect maskRect, CanvasWidget mask) {
    final double padding = _clipMaskContentPadding(mask);
    if (padding <= 0 || maskRect.isEmpty) {
      return maskRect;
    }
    final Rect inset = maskRect.deflate(padding);
    if (inset.width <= 0 || inset.height <= 0) {
      return maskRect;
    }
    return inset;
  }

  bool _layerHasClippedChildren(
    CanvasWidget mask, {
    required List<CanvasWidget> layers,
  }) {
    return layers.any((CanvasWidget w) => w.clippedTo == mask.id);
  }

  List<CanvasWidget> _clippedChildrenOfMask(
    String maskLayerId,
    List<CanvasWidget> layers,
  ) {
    return layers
        .where(
          (CanvasWidget w) => w.clippedTo == maskLayerId && w.isVisible,
        )
        .toList()
      ..sort((CanvasWidget a, CanvasWidget b) => a.zIndex.compareTo(b.zIndex));
  }

  List<Widget> _buildCanvasLayersFor({
    required bool isFromFrame,
    bool contentVisible = true,
  }) {
    final List<CanvasWidget> layers = _canvasWidgets
        .where(
          (CanvasWidget w) => w.isVisible && w.isFromFrame == isFromFrame,
        )
        .toList()
      ..sort((CanvasWidget a, CanvasWidget b) => a.zIndex.compareTo(b.zIndex));

    final String? selectedId = _selectedWidgetId;
    final List<CanvasWidget> orderedLayers = <CanvasWidget>[];
    CanvasWidget? selectedLayer;
    for (final CanvasWidget layer in layers) {
      if (layer.id == selectedId && !_isUntouchableBackgroundLayer(layer)) {
        selectedLayer = layer;
      } else {
        orderedLayers.add(layer);
      }
    }
    if (selectedLayer != null) {
      orderedLayers.add(selectedLayer);
    }

    final Set<String> groupedClipChildIds = <String>{};
    final List<Widget> built = <Widget>[];

    for (final CanvasWidget widget in orderedLayers) {
      if (widget.clippedTo != null && widget.clippedTo!.isNotEmpty) {
        continue;
      }
      if (_layerHasClippedChildren(widget, layers: layers)) {
        final List<CanvasWidget> clipChildren =
            _clippedChildrenOfMask(widget.id, layers);
        groupedClipChildIds.addAll(
          clipChildren.map((CanvasWidget c) => c.id),
        );
        built.add(
          _buildClipMaskGroup(mask: widget, clippedLayers: clipChildren),
        );
      } else {
        built.add(
          _buildInteractiveCanvasLayer(
            widget,
            contentVisible: contentVisible,
          ),
        );
      }
    }

    for (final CanvasWidget widget in layers) {
      if (widget.id == selectedId) continue;
      if (widget.clippedTo != null &&
          widget.clippedTo!.isNotEmpty &&
          !groupedClipChildIds.contains(widget.id)) {
        built.add(
          _buildInteractiveCanvasLayer(
            widget,
            contentVisible: contentVisible,
          ),
        );
      }
    }
    if (selectedLayer != null &&
        selectedLayer.clippedTo != null &&
        selectedLayer.clippedTo!.isNotEmpty &&
        !groupedClipChildIds.contains(selectedLayer.id)) {
      built.add(
        _buildInteractiveCanvasLayer(
          selectedLayer,
          contentVisible: contentVisible,
        ),
      );
    }

    return built;
  }

  BoxFit _parseLayerBoxFit(Map<String, dynamic> layer) {
    if (layer['fill'] == true || layer['fill'] == 'true') {
      return BoxFit.fill;
    }
    final String raw =
        (layer['fitMode'] ?? layer['fit'] ?? layer['boxFit'])
            ?.toString()
            .toLowerCase()
            .trim() ??
        '';
    switch (raw) {
      case 'fill':
        return BoxFit.fill;
      case 'cover':
        return BoxFit.cover;
      case 'contain':
        return BoxFit.contain;
      case 'fitwidth':
      case 'fit_width':
        return BoxFit.fitWidth;
      case 'fitheight':
      case 'fit_height':
        return BoxFit.fitHeight;
      case 'none':
        return BoxFit.none;
      case 'scaledown':
      case 'scale_down':
        return BoxFit.scaleDown;
    }
    return BoxFit.contain;
  }

  BoxFit _resolveClipMaskFillFit(CanvasWidget mask) {
    if (mask.fill || mask.boxFit == BoxFit.fill) {
      return BoxFit.fill;
    }
    return BoxFit.fill;
  }

  Widget _buildClipMaskFillVisual(CanvasWidget mask) {
    final double width = mask.boxWidth ?? 0;
    final double height = mask.boxHeight ?? 0;
    if (width <= 0 || height <= 0) {
      return const SizedBox.shrink();
    }

    final BoxFit fillFit = _resolveClipMaskFillFit(mask);
    final bool hasFillColor =
        mask.color.alpha > 0 && mask.color != Colors.transparent;
    final bool hasImage =
        mask.imagePath != null && mask.imagePath!.isNotEmpty;
    final Color? fillColor =
        hasFillColor ? mask.color : null;

    Widget content;
    if (hasFillColor && hasImage) {
      content = Stack(
        fit: StackFit.expand,
        children: <Widget>[
          if (fillColor != null) ColoredBox(color: fillColor),
          Image(
            image: _getImageProvider(mask.imagePath!),
            fit: fillFit,
            width: double.infinity,
            height: double.infinity,
            errorBuilder: (BuildContext context, Object error, StackTrace? st) =>
                const SizedBox.shrink(),
          ),
        ],
      );
    } else if (hasImage) {
      content = Image(
        image: _getImageProvider(mask.imagePath!),
        fit: fillFit,
        width: width,
        height: height,
        errorBuilder: (BuildContext context, Object error, StackTrace? st) =>
            const Icon(Icons.broken_image),
      );
    } else if (fillColor != null) {
      content = ColoredBox(color: fillColor);
    } else {
      return _buildCanvasWidget(mask);
    }

    content = _clipWidgetToLayerMaskShape(
      widget: mask,
      child: content,
      maskRect: Rect.fromLTWH(0, 0, width, height),
    );

    return SizedBox(width: width, height: height, child: content);
  }

  Widget _buildClipMaskGroup({
    required CanvasWidget mask,
    required List<CanvasWidget> clippedLayers,
  }) {
    final Rect maskRect = Rect.fromLTWH(
      mask.position.dx,
      mask.position.dy,
      mask.boxWidth ?? 0,
      mask.boxHeight ?? 0,
    );
    final Rect clipRect = _clipMaskContentRect(maskRect, mask);

    return Stack(
      key: ValueKey<String>('clip-mask-${mask.id}-c$_shapeColorRevision'),
      clipBehavior: Clip.none,
      children: <Widget>[
        // Mask layer fills the outer shape (full bounds up to the border).
        Positioned(
          left: mask.position.dx,
          top: mask.position.dy,
          child: IgnorePointer(
            child: Opacity(
              opacity: _effectiveLayerOpacity(mask),
              child: _buildClipMaskFillVisual(mask),
            ),
          ),
        ),
        // Clipped layers use canvas coordinates; clip path limits visible area.
        Positioned.fill(
          child: ClipPath(
            clipBehavior: Clip.antiAlias,
            clipper: _LayerMaskClipper(
              maskRect: clipRect,
              isEllipse: _layerShapeIsEllipse(mask.shape),
              borderRadius: mask.borderRadius,
              cornerRadii: mask.cornerRadii,
            ),
            child: Stack(
              clipBehavior: Clip.none,
              children: clippedLayers
                  .map(
                    (CanvasWidget child) => _buildClippedChildInMaskGroup(
                      child: child,
                    ),
                  )
                  .toList(),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildClippedChildInMaskGroup({
    required CanvasWidget child,
  }) {
    if (_isUntouchableBackgroundLayer(child)) {
      return Positioned(
        left: child.position.dx,
        top: child.position.dy,
        child: IgnorePointer(
          child: Opacity(
            opacity: _effectiveLayerOpacity(child),
            child: _buildCanvasWidget(child),
          ),
        ),
      );
    }

    return Positioned(
      left: child.position.dx,
      top: child.position.dy,
      child: _buildInteractiveLayerTransform(
        child,
        includeResizeOverlay:
            child.isEditable && _selectedWidgetId == child.id,
      ),
    );
  }

  /// Fixes faulty layer data before mapping (e.g. text clipping).
  Map<String, dynamic> _fixJsonLayer(Map<String, dynamic> layer) {
    final Map<String, dynamic> fixed = Map<String, dynamic>.from(layer);
    final String type = (fixed['type']?.toString() ?? '').toLowerCase();

    if (type == 'text') {
      final bool isAddressLayer =
          FooterBusinessProfileBinder.isFooterAddressTextLayer(fixed);
      if (isAddressLayer) {
        fixed['textAlign'] = 'left';
      }
      TemplateLayerGeometryParser.preserveTextLayerBoxGeometry(fixed);
    }

    return fixed;
  }

  List<CanvasWidget> _mapTemplateLayersToWidgets(
    List<dynamic> layers, {
    bool isFromFrame = false,
  }) {
    final List<CanvasWidget> mapped = [];
    final List<Map<String, dynamic>> footerLayerMaps = isFromFrame
        ? layers
            .whereType<Map<String, dynamic>>()
            .map((Map<String, dynamic> raw) => _fixJsonLayer(raw))
            .toList()
        : const <Map<String, dynamic>>[];
    for (final dynamic rawLayer in layers) {
      if (rawLayer is! Map<String, dynamic>) continue;
      final layer = _fixJsonLayer(rawLayer);
      final String layerType = (layer['type']?.toString() ?? '').toLowerCase();
      if (layerType == 'group') {
        continue; // Group layers are structural; render only concrete layers from JSON.
      }

      final String rasterSource =
          (layer['value']?.toString().trim().isNotEmpty ?? false)
          ? layer['value'].toString().trim()
          : (layer['src']?.toString().trim().isNotEmpty ?? false
                ? layer['src'].toString().trim()
                : (layer['url']?.toString().trim() ?? ''));

      CanvasWidgetType? type;
      if (layerType == 'text') {
        type = CanvasWidgetType.text;
      } else if (layerType == 'image') {
        type = CanvasWidgetType.logo;
      } else if (layerType == 'shape') {
        // Render shape layers only when rasterized source is provided by JSON.
        type = rasterSource.isNotEmpty ? CanvasWidgetType.logo : null;
      }
      if (type == null) {
        continue;
      }

      final double rotDegrees = _asDouble(layer['rotation']);
      final double rotRadians = rotDegrees * (pi / 180.0);
      final String layerText = layer['value']?.toString() ?? '';
      final double parsedFontSize = type == CanvasWidgetType.text
          ? _asDouble(layer['fontSize'])
          : 0.0;
      final String postscriptName =
          layer['fontPostScriptName']?.toString().trim() ?? '';
      String resolvedFontFamily =
          (layer['fontFamily']?.toString().trim().isNotEmpty ?? false)
          ? layer['fontFamily'].toString().trim()
          : (postscriptName.isNotEmpty ? postscriptName : 'Outfit');
      Map<String, dynamic>? resolvedFontUrls;
      if (layer['fontUrls'] is Map) {
        resolvedFontUrls = Map<String, dynamic>.from(layer['fontUrls'] as Map);
      } else if (layer['fontUrls'] is List) {
        final List urls = layer['fontUrls'] as List;
        resolvedFontUrls = {};
        for (var url in urls) {
          final s = url.toString().toLowerCase();
          if (s.endsWith('.ttf')) {
            resolvedFontUrls['ttf'] = url;
          } else if (s.endsWith('.otf'))
            resolvedFontUrls['otf'] = url;
          else if (s.endsWith('.woff'))
            resolvedFontUrls['woff'] = url;
          else if (s.endsWith('.woff2'))
            resolvedFontUrls['woff2'] = url;
        }
      }

      final String? layerTtfUrl = _extractPrimaryTtfUrl(resolvedFontUrls);

      // Look up catalog match regardless of whether layer provides a TTF URL.
      // This gives us a solid fallback if the JSON URL is broken or expired.
      final FontCatalogItem? catalogMatch = _findFontCatalogMatch(
        fontFamily: resolvedFontFamily,
        postscriptName: postscriptName,
      );

      final String matchedCatalogUrl = catalogMatch?.url?.trim() ?? '';

      if (catalogMatch != null) {
        final String preferredFamily = _preferredFontFamilyForCatalogItem(
          catalogMatch,
        );
        if (preferredFamily.isNotEmpty) {
          resolvedFontFamily = preferredFamily;
        }
      }

      if (layerTtfUrl != null && layerTtfUrl.isNotEmpty) {
        resolvedFontUrls = <String, dynamic>{'ttf': layerTtfUrl};
        // Add catalog URL as a fallback if it exists and is different
        if (matchedCatalogUrl.isNotEmpty && matchedCatalogUrl != layerTtfUrl) {
          resolvedFontUrls['.ttf'] = matchedCatalogUrl;
        }
      } else {
        if (matchedCatalogUrl.isNotEmpty) {
          (resolvedFontUrls ??= <String, dynamic>{})['ttf'] = matchedCatalogUrl;
          resolvedFontUrls['otf'] = matchedCatalogUrl;
        }
      }
      final String textTransform =
          layer['textTransform']?.toString().trim().toLowerCase() ?? 'none';

      final bool fill = layer['fill'] == true;
      final BoxFit resolvedBoxFit = _parseLayerBoxFit(layer);

      final bool userReplaceable =
          layer['userReplaceable'] == true ||
          layer['userReplaceable'] == 'true';
      final bool isShapeRasterLayer =
          layerType == 'shape' && rasterSource.isNotEmpty;
      final bool isLayerClipped =
          layer['isClipped'] == true || layer['isClipped'] == 'true';
      final String rawLayerId = layer['id']?.toString() ?? '';
      final bool isUntouchableBackgroundLayer =
          !isFromFrame && rawLayerId == _untouchableBackgroundLayerId;
      final bool layerEditable =
          layer['editable'] != false && layer['editable'] != 'false';
      final bool effectiveEditable = !isUntouchableBackgroundLayer &&
          (layerEditable ||
              (type == CanvasWidgetType.logo && userReplaceable) ||
              isShapeRasterLayer);

      final ({double width, Color color}) border =
          _resolveLayerBorderStyle(layer);

      double finalX = _asDouble(layer['x']);
      double finalY = _asDouble(layer['y']);
      double? finalW = _asDouble(layer['w']) == 0 ? null : _asDouble(layer['w']);
      double? finalH = _asDouble(layer['h']) == 0 ? null : _asDouble(layer['h']);

      final bool isFooterAddressLayer = isFromFrame &&
          type == CanvasWidgetType.text &&
          FooterBusinessProfileBinder.isFooterAddressTextLayer(
            layer,
            allLayers: footerLayerMaps,
          );

      if (isFooterAddressLayer) {
        finalX += 5.0;
      }

      if (isFromFrame && type == CanvasWidgetType.text) {
        final String rawText = layerText;
        final String transformedText = textTransform == 'uppercase'
            ? rawText.toUpperCase()
            : (textTransform == 'lowercase' ? rawText.toLowerCase() : rawText);
        final double letterSpacing = _asDouble(layer['letterSpacingPx'] ?? layer['letterSpacing']);
        final double? lineHeightPx = _asDouble(layer['lineHeightPx'] ?? layer['lineHeight']);
        final bool isMultiline = transformedText.contains('\n') || layer['isAddressTemplateDetails'] == true;
        final double? lineHeightFactor = (lineHeightPx != null && parsedFontSize > 0 && isMultiline) ? (lineHeightPx / parsedFontSize) : null;

        if (!isFooterAddressLayer) {
          final textPainter = TextPainter(
            text: TextSpan(
              text: transformedText,
              style: TextStyle(
                fontSize: parsedFontSize,
                fontFamily: resolvedFontFamily,
                letterSpacing: letterSpacing,
                height: lineHeightFactor,
              ),
            ),
            textDirection: TextDirection.ltr,
          );

          textPainter.layout(maxWidth: double.infinity);

          final double tightW = textPainter.width;
          final double tightH = textPainter.height;

          if (finalW != null && tightW != finalW) {
            final String align = (layer['textAlign']?.toString() ?? 'left').toLowerCase();
            if (align == 'center') {
              finalX = finalX + (finalW - tightW) / 2;
            } else if (align == 'right') {
              finalX = finalX + (finalW - tightW);
            }
            finalW = tightW;
          }

          if (finalH != null && tightH < finalH) {
            finalH = tightH;
          }
        }
      }

      double? footerLineHeightFactor;
      if (isFromFrame &&
          type == CanvasWidgetType.text &&
          parsedFontSize > 0 &&
          layer['lineHeight'] != null) {
        footerLineHeightFactor =
            _asDouble(layer['lineHeight']) / parsedFontSize;
      }

      final double? templateLineHeightFactor = !isFromFrame &&
              type == CanvasWidgetType.text
          ? TemplateLayerGeometryParser.textLineHeightFactor(layer)
          : null;
      final bool templateLineHeightCustomized =
          templateLineHeightFactor != null && templateLineHeightFactor > 0;

      final widgetItem = CanvasWidget(
        id:
            (isFromFrame ? 'footer_' : 'template_') +
            (layer['id']?.toString() ??
                'layer_${DateTime.now().millisecondsSinceEpoch}_${layers.indexOf(rawLayer)}'),
        type: type,
        position: Offset(finalX, finalY),
        boxWidth: finalW,
        boxHeight: finalH,
        rotation: rotRadians,
        opacity: _asDouble(layer['opacity'], fallback: 1.0),
        isLocked: isUntouchableBackgroundLayer ||
            layer['locked'] == true ||
            layer['locked'] == 'true',
        isEditable: effectiveEditable,
        userReplaceable: userReplaceable,
        imagePath: type == CanvasWidgetType.logo ? rasterSource : null,
        text: type == CanvasWidgetType.text ? layerText : null,
        color: type == CanvasWidgetType.text
            ? _parseColor(layer['color'])
            : (isLayerClipped
                ? Colors.transparent
                : (isShapeRasterLayer
                    ? _parseColor(layer['color'])
                    : Colors.black)),
        isShapeRasterLayer: isShapeRasterLayer,
        shape: layer['shape']?.toString() ?? 'rectangle',
        textAlign: isFooterAddressLayer
            ? TextAlign.left
            : _parseTextAlign(layer['textAlign']?.toString()),
        fontSize: parsedFontSize,
        fontFamily: resolvedFontFamily,
        fontWeight: _parseFontWeight(layer['fontWeight']),
        fontStyle: _parseFontStyle(layer['fontStyle']?.toString()),
        decoration: _parseTextDecoration(
          underline: layer['underline'],
          strikethrough: layer['strikethrough'],
        ),
        isUpperCase: textTransform == 'uppercase',
        textTransform: textTransform,
        isAutoFitText: false,
        letterSpacing: _asDouble(
          layer['letterSpacingPx'] ?? layer['letterSpacing'],
        ),
        height: isFromFrame ? footerLineHeightFactor : templateLineHeightFactor,
        lineHeight: isFromFrame
            ? (footerLineHeightFactor ?? 1.0)
            : (templateLineHeightCustomized
                ? templateLineHeightFactor!
                : _kDefaultSoftWrappedLineHeight),
        lineHeightCustomized: isFromFrame
            ? footerLineHeightFactor != null
            : templateLineHeightCustomized,
        textGradient: _parseLayerLinearGradient(layer),
        hasShadow:
            (layer['shadow'] ??
                layer['styles']?['shadow'] ??
                layer['styles']?['shadows']) !=
            null,
        shadows: _parseShadows(
          layer['shadow'] ??
              layer['styles']?['shadow'] ??
              layer['styles']?['shadows'],
        ),
        fontUrls: resolvedFontUrls,
        blendModeName: layer['blendMode']?.toString() ?? 'normal',
        softWrap: isFromFrame
            ? (layer['softWrap'] == true || layer['softWrap'] == 'true')
            : true,
        isFromFrame: isFromFrame,
        zIndex: (layer['zIndex'] is num) ? (layer['zIndex'] as num).toInt() : 0,
        isVisible: layer['visible'] != false,
        backgroundColor: layer['fillColor'] != null
            ? _parseColor(layer['fillColor'])
            : null,
        borderRadius: TemplateLayerGeometryParser.parseBorderRadius(
          layer['borderRadius'],
        ).maxRadius,
        cornerRadii: () {
          final ParsedLayerBorderRadius parsed =
              TemplateLayerGeometryParser.parseBorderRadius(
            layer['borderRadius'],
          );
          return parsed.hasCorners ? parsed.toBorderRadius() : null;
        }(),
        borderWidth: border.width,
        borderColor: border.color,
        fillOpacity: _asDouble(layer['fillOpacity'], fallback: 1.0),
        blendOpacity: _asDouble(
          layer['blendOpacity'] ?? layer['blendFillOpacity'],
          fallback: 1.0,
        ),
        name: layer['name']?.toString(),
        role: isFromFrame
            ? (isFooterAddressLayer
                ? FooterBusinessProfileBinder.addressFieldId
                : FooterBusinessProfileBinder.resolveProfileFieldId(
                    layer,
                    allLayers: footerLayerMaps,
                  ))
            : layer['role']?.toString(),
        boxFit: resolvedBoxFit,
        fill: fill,
        maxLines: layer['maxLines'] != null
            ? _asDouble(layer['maxLines']).toInt()
            : null,
        warp: layer['warp'] is Map<String, dynamic>
            ? Map<String, dynamic>.from(layer['warp'])
            : null,
        baselineShift: TemplateLayerGeometryParser.parseBaselineShift(layer),
        isClipped: layer['isClipped'] == true || layer['isClipped'] == 'true',
        clippedTo: _resolveClippedToLayerId(
          layer['clippedTo'],
          isFromFrame: isFromFrame,
        ),
        clipContentPadding: _resolveClipContentPaddingFromLayer(layer),
      );
      if (isFromFrame &&
          widgetItem.role == FooterBusinessProfileBinder.logoFieldId &&
          widgetItem.type == CanvasWidgetType.logo) {
        widgetItem.shape = 'circle';
        widgetItem.boxFit = BoxFit.cover;
        final double bw = widgetItem.boxWidth ?? _asDouble(layer['w']);
        final double bh = widgetItem.boxHeight ?? _asDouble(layer['h']);
        final double diameter = bw > 0 && bh > 0 ? min(bw, bh) : 0.0;
        if (diameter > 0) {
          widgetItem.borderRadius = diameter / 2;
        }
      }
      if (resolvedFontUrls != null && resolvedFontFamily.isNotEmpty) {
        _loadRemoteFont(resolvedFontFamily, resolvedFontUrls);
      }
      if (widgetItem.type == CanvasWidgetType.text && !isFromFrame) {
        _syncDefaultLineHeight(widgetItem);
      }

      // debugPrint(
        // 'LAYER_BLEND: id=${widgetItem.id} type=${widgetItem.type.name} '
        // 'mode=${widgetItem.blendModeName} '
        // 'opacity=${widgetItem.opacity.toStringAsFixed(3)} '
        // 'fillOpacity=${widgetItem.fillOpacity.toStringAsFixed(3)} '
        // 'blendOpacity=${widgetItem.blendOpacity.toStringAsFixed(3)} '
        // 'effective=${_effectiveLayerOpacity(widgetItem).toStringAsFixed(3)}',
      // );
      mapped.add(widgetItem);
    }

    mapped.sort((a, b) => a.zIndex.compareTo(b.zIndex));
    return mapped;
  }

  ({List<CanvasWidget> firstPass, List<CanvasWidget> finalPass})
  _splitForProgressiveRender(List<CanvasWidget> widgets) {
    // Fast-pass paints non-text layers first (heavy visual skeleton),
    // then restores the complete, fully editable layer set.
    final List<CanvasWidget> firstPass = widgets
        .where((w) => w.type != CanvasWidgetType.text)
        .toList();
    if (firstPass.isEmpty || firstPass.length == widgets.length) {
      return (firstPass: widgets, finalPass: widgets);
    }
    return (firstPass: firstPass, finalPass: widgets);
  }

  Future<void> _prefetchTemplateFonts(List<CanvasWidget> widgets) async {
    final List<Future<void>> jobs = <Future<void>>[];
    final Set<String> queued = <String>{};
    for (final CanvasWidget item in widgets) {
      if (item.type != CanvasWidgetType.text) continue;
      final String family = (item.fontFamily ?? '').trim();
      if (family.isEmpty) continue;

      final Map<String, dynamic> sourceUrls =
          item.fontUrls ?? <String, dynamic>{};
      if (sourceUrls.isEmpty) continue;

      final String cacheKey =
          '$family|${sourceUrls.values.map((e) => e.toString()).join('|')}';
      if (!queued.add(cacheKey)) continue;

      jobs.add(_loadRemoteFont(family, sourceUrls));
    }
    if (jobs.isEmpty) return;
    await Future.wait(jobs);
  }

  Future<void> _prefetchTemplateImages(
    List<CanvasWidget> widgets,
    int requestVersion,
  ) async {
    final List<CanvasWidget> visibleWidgets =
        widgets
            .where(
              (w) =>
                  w.isVisible &&
                  w.type == CanvasWidgetType.logo &&
                  (w.imagePath?.startsWith('http') ?? false),
            )
            .toList();

    if (visibleWidgets.isEmpty) {
      if (mounted && requestVersion == _templateLoadVersion) {
        setState(() => _templateLoadingPercent = 100);
      }
      return;
    }

    final int total = visibleWidgets.length;
    int completed = 0;

    // Process all images in parallel for maximum speed
    await Future.wait(
      visibleWidgets.map((item) async {
        if (!mounted || requestVersion != _templateLoadVersion) return;

        final String url = item.imagePath!;
        try {
          // Parallelize precaching and disk caching for each image
          await Future.wait([
            precacheImage(NetworkImage(url), context),
            DefaultCacheManager().getSingleFile(
              url,
              key: 'template_img_${url.hashCode}',
            ),
          ]);
          await _resolveImageSourceDimensions(item);
        } catch (_) {
          // Best-effort
        }

        completed++;
        if (mounted && requestVersion == _templateLoadVersion) {
          setState(() {
            _templateLoadingPercent = (completed / total) * 100;
          });
        }
      }),
    );
  }

  String? _lastLoadingTemplateId;

  Future<void> _fetchTemplateData() async {
    if (widget.templateId == null) return;

    // GUARD: Prevent redundant loading if already in progress for the same template
    if (_isLoadingTemplate && _lastLoadingTemplateId == widget.templateId) {
      // debugPrint("DEBUG: Template load already in progress for ${widget.templateId}, skipping redundant call.");
      return;
    }
    _lastLoadingTemplateId = widget.templateId;

    final int requestVersion = ++_templateLoadVersion;
    setState(() {
      _isLoadingTemplate = true;
      _templateLoadingPercent = 0;
      _canvasWidgets.removeWhere((w) => !w.isFromFrame);
    });

    final Stopwatch stopwatch = Stopwatch()..start();
    try {
      final Map<String, dynamic> enriched;
      if (widget.initialEnrichedTemplateJson != null &&
          widget.initialEnrichedTemplateJson!.isNotEmpty) {
        enriched = Map<String, dynamic>.from(widget.initialEnrichedTemplateJson!);
      } else {
        final result = await _getEnrichedTemplateJson(
          GetEnrichedTemplateJsonParams(templateId: widget.templateId!),
        );
        enriched = result.fold(
          (failure) => throw Exception(failure.message),
          (Map<String, dynamic> json) => json,
        );
      }
      _cachedEnrichedTemplateJson = enriched;

      final double ratio =
          _canvasSize != Size.zero
              ? (_canvasSize.width / _canvasSize.height)
              : _getAspectRatio();

      final prepared =
          await compute<Map<String, dynamic>, Map<String, dynamic>>(
            _prepareTemplatePayloadForEditor,
            <String, dynamic>{'decoded': enriched, 'aspectRatio': ratio},
          );

          final Map<String, dynamic>? canvasSetting =
              prepared['canvas'] is Map<String, dynamic>
              ? prepared['canvas'] as Map<String, dynamic>
              : null;
          final List<dynamic> layers = prepared['layers'] is List
              ? prepared['layers'] as List<dynamic>
              : [];

          final Color nextBackground = canvasSetting?['background'] != null
              ? _parseColor(canvasSetting!['background'])
              : _backgroundColor;
          final Size nextCanvasSize =
              (canvasSetting?['width'] != null &&
                  canvasSetting?['height'] != null)
              ? Size(
                  _asDouble(
                    canvasSetting?['width'],
                    fallback: _canvasSize.width,
                  ),
                  _asDouble(
                    canvasSetting?['height'],
                    fallback: _canvasSize.height,
                  ),
                )
              : _canvasSize;

          await _ensureRemoteFontsLoaded();

          final List<CanvasWidget> mappedWidgets = _mapTemplateLayersToWidgets(
            layers,
            isFromFrame: false,
          );

          if (!mounted || requestVersion != _templateLoadVersion) {
            return;
          }

          // HIGH PERFORMANCE: Parallelize font and image prefetching
          await Future.wait([
            _prefetchTemplateFonts(mappedWidgets),
            _prefetchTemplateImages(mappedWidgets, requestVersion),
            _prefetchImageSourceDimensions(mappedWidgets),
          ]);

          if (!mounted || requestVersion != _templateLoadVersion) {
            return;
          }

          _refitAllTextLayerBoxes(mappedWidgets);

          if (_enableProgressiveTemplateRendering) {
            final split = _splitForProgressiveRender(mappedWidgets);
            setState(() {
              _backgroundColor = nextBackground;
              _canvasSize = nextCanvasSize;

              // If current footer size doesn't match new template size, clear all frames
              final bool footerMatches =
                  _selectedFrameJson != null &&
                  _asDouble(_selectedFrameJson!['canvas']?['width']) ==
                      nextCanvasSize.width &&
                  _asDouble(_selectedFrameJson!['canvas']?['height']) ==
                      nextCanvasSize.height;

              _canvasWidgets.removeWhere((w) => !w.isFromFrame || !footerMatches);

              _canvasWidgets.addAll(split.firstPass);
              _canvasWidgets.sort((a, b) => a.zIndex.compareTo(b.zIndex));
            });

            if (split.firstPass.length != split.finalPass.length) {
              await Future.delayed(_progressiveRenderDelay);
              if (!mounted || requestVersion != _templateLoadVersion) {
                return;
              }
              setState(() {
                _canvasWidgets.removeWhere((w) => !w.isFromFrame);
                _canvasWidgets.addAll(split.finalPass);
                _canvasWidgets.sort((a, b) => a.zIndex.compareTo(b.zIndex));
              });
            }
            if (mounted && requestVersion == _templateLoadVersion) {
              setState(() => _isLoadingTemplate = false);
            }
          } else {
            setState(() {
              _backgroundColor = nextBackground;
              _canvasSize = nextCanvasSize;

              // If current footer size doesn't match new template size, clear all frames
              final bool footerMatches =
                  _selectedFrameJson != null &&
                  _asDouble(_selectedFrameJson!['canvas']?['width']) ==
                      nextCanvasSize.width &&
                  _asDouble(_selectedFrameJson!['canvas']?['height']) ==
                      nextCanvasSize.height;

              _canvasWidgets.removeWhere((w) => !w.isFromFrame || !footerMatches);

              _canvasWidgets.addAll(mappedWidgets);
              _canvasWidgets.sort((a, b) => a.zIndex.compareTo(b.zIndex));
              _templateLoadingPercent = 100;
              _isLoadingTemplate = false;
            });
          }

          _templateFetchFinished = true;
          _tryCaptureOriginalBaseline();
          if (_selectedFrameJson != null) {
            final bool footerMatches =
                _asDouble(_selectedFrameJson!['canvas']?['width']) ==
                    nextCanvasSize.width &&
                _asDouble(_selectedFrameJson!['canvas']?['height']) ==
                    nextCanvasSize.height;
            if (footerMatches) {
              _applyFooterLayout(_selectedFrameJson);
            }
          }
          unawaited(_loadFooterFrames(force: true));

          // debugPrint(
            // 'TEMPLATE_PERF: template=${widget.templateId} layers=${mappedWidgets.length} '
            // 'loaded_in_ms=${stopwatch.elapsedMilliseconds}',
          // );
    } catch (e) {
      // debugPrint("Failed to fetch template layers: $e");
      if (mounted && requestVersion == _templateLoadVersion) {
        setState(() => _isLoadingTemplate = false);
        _templateFetchFinished = true;
        _tryCaptureOriginalBaseline();
      }
    }
  }

  double _getAspectRatio() {
    // Priority: Actual video aspect ratio if present
    if (_initialVideoController != null &&
        _initialVideoController!.value.isInitialized) {
      return _initialVideoController!.value.aspectRatio;
    }

    if (_canvasSize != Size.zero) {
      return _canvasSize.width / _canvasSize.height;
    }

    // Fallback parsing if _canvasSize not ready
    List<String> parts = widget.dimension.split('×');
    if (parts.length != 2) {
      parts = widget.dimension.split('x');
    }

    if (parts.length == 2) {
      double w = double.tryParse(parts[0]) ?? 1080;
      double h = double.tryParse(parts[1]) ?? 1920;
      return w / h;
    }

    return 1.0;
  }

  void _showMusicBottomSheet() {
    _isTrimmingMode = false;
    _tempTrimmingMusic = null;

    _showManagedModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => BlocProvider(
        create: (context) => sl<MusicCubit>()..getInitialMusic(),
        child: BlocBuilder<MusicCubit, MusicState>(
          builder: (context, state) {
            return StatefulBuilder(
              builder: (context, setModalState) {
                return Container(
                  height: MediaQuery.of(context).size.height * 0.85,
                  padding: const EdgeInsets.symmetric(horizontal: 0),
                  child: Column(
                    children: [
                      const SizedBox(height: 12),
                      Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: Colors.grey[300],
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                      const SizedBox(height: 20),
                      // Header
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              _isTrimmingMode ? "Adjust Music" : "Music",
                              style: TextStyle(
                                fontFamily: 'Outfit',
                                fontSize: 22,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            if (_isTrimmingMode)
                              TextButton(
                                onPressed: () async {
                                  if (_tempTrimmingMusic != null) {
                                    final trimmedMusic = _tempTrimmingMusic!
                                        .copyWith(
                                          clipStart: _clipStartSeconds,
                                          clipDuration: _clipDurationSeconds,
                                        );

                                    // Snap and keep playing in the editor
                                    await _audioPlayer.seek(
                                      Duration(
                                        milliseconds: (_clipStartSeconds * 1000)
                                            .toInt(),
                                      ),
                                    );
                                    if (_audioPlayer.state !=
                                        PlayerState.playing) {
                                      await _audioPlayer.resume();
                                    }

                                    setState(() {
                                      _selectedMusic = trimmedMusic;
                                      _canvasWidgets.removeWhere(
                                        (w) => w.type == CanvasWidgetType.music,
                                      );
                                      _isTrimmingMode = false;
                                      _tempTrimmingMusic = null;
                                    });
                                    if (mounted) Navigator.pop(context);
                                  }
                                },
                                child: Text(
                                  "Done",
                                  style: TextStyle(
                                    fontFamily: 'Outfit',
                                    fontWeight: FontWeight.bold,
                                    color: Colors.blue,
                                  ),
                                ),
                              )
                            else
                              IconButton(
                                icon: const Icon(Icons.close),
                                onPressed: () {
                                  _audioPlayer.stop();
                                  _currentlyPlayingId = null;
                                  Navigator.pop(context);
                                },
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),

                      if (!_isTrimmingMode) ...[
                        // Search Bar
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            decoration: BoxDecoration(
                              color: Colors.grey[100],
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: TextField(
                              onChanged: (value) {
                                context.read<MusicCubit>().searchMusic(value);
                              },
                              decoration: InputDecoration(
                                hintText: "Search Spotify music",
                                hintStyle: TextStyle(
                                  fontFamily: 'Outfit',
                                  color: Colors.grey,
                                ),
                                border: InputBorder.none,
                                icon: const Icon(
                                  Icons.search,
                                  color: Colors.grey,
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 20),
                        // Tabs
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          child: Row(
                            children: [
                              Text(
                                "Trending",
                                style: TextStyle(
                                  fontFamily: 'Outfit',
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(width: 24),
                              Text(
                                "Genres",
                                style: TextStyle(
                                  fontFamily: 'Outfit',
                                  fontSize: 16,
                                  fontWeight: FontWeight.w500,
                                  color: Colors.grey,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        const Divider(),
                        // Music List
                        Expanded(child: _buildMusicList(state, setModalState)),
                      ] else ...[
                        const SizedBox(height: 40),
                        // Trimming UI
                        if (_tempTrimmingMusic != null) ...[
                          Center(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(15),
                              child: Image.network(
                                _tempTrimmingMusic!.coverUrl,
                                width: 140,
                                height: 140,
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                          const SizedBox(height: 20),
                          Text(
                            _tempTrimmingMusic!.title,
                            style: TextStyle(
                              fontFamily: 'Outfit',
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          Text(
                            _tempTrimmingMusic!.artist,
                            style: TextStyle(
                              fontFamily: 'Outfit',
                              fontSize: 14,
                              color: Colors.grey,
                            ),
                          ),
                          const SizedBox(height: 40),

                          // Duration Picker Trigger
                          GestureDetector(
                            onTap: () => _showDurationPicker(setModalState),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.grey[100],
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.timer_outlined, size: 16),
                                  const SizedBox(width: 8),
                                  Text(
                                    "${_clipDurationSeconds} Seconds",
                                    style: TextStyle(
                                      fontFamily: 'Outfit',
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 30),
                          _buildWaveformTrimmer(
                            _tempTrimmingMusic!,
                            setModalState,
                          ),
                        ],
                      ],
                    ],
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }

  void _stopMusic() {
    _audioPlayer.stop();
    if (mounted) {
      setState(() {
        _selectedMusic = null;
        _canvasWidgets.removeWhere((w) => w.type == CanvasWidgetType.music);
      });
    }
  }

  Future<void> _toggleCanvasMusicPlayback() async {
    if (_selectedMusic == null || _isTogglingCanvasMusicPlayback) return;
    setState(() => _isTogglingCanvasMusicPlayback = true);
    try {
      if (_audioPlayer.state == PlayerState.playing) {
        await _audioPlayer.pause();
      } else if (_audioPlayer.state == PlayerState.paused) {
        await _audioPlayer.resume();
      } else {
        final String? localPath = await _prepareTrack(_selectedMusic!);
        if (localPath == null || localPath.isEmpty) {
          throw Exception("Music file unavailable");
        }
        await _audioPlayer.play(DeviceFileSource(localPath));
        await _audioPlayer.seek(
          Duration(milliseconds: (_selectedMusic!.clipStart * 1000).toInt()),
        );
        await _audioPlayer.setReleaseMode(ReleaseMode.loop);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              "Unable to play music: $e",
              style: TextStyle(fontFamily: 'Outfit'),
            ),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isTogglingCanvasMusicPlayback = false);
      }
    }
  }

  Future<String?> _prepareTrack(Music track) async {
    // debugPrint("Preparing track: ${track.title}");
    // debugPrint("Preview URL: ${track.previewUrl}");

    if (track.previewUrl.isEmpty) {
      // debugPrint("Playback Error: Track preview URL is empty");
      throw Exception("Track preview URL is empty");
    }

    try {
      final cacheManager = DefaultCacheManager();
      // Use a unique key for music to prevent collisions
      final fileInfo = await cacheManager.getFileFromCache("music_${track.id}");

      if (fileInfo != null) {
        // debugPrint("Loading music from cache: ${fileInfo.file.path}");
        return fileInfo.file.path;
      }

      // debugPrint("Downloading music preview...");
      final file = await cacheManager.downloadFile(
        track.previewUrl,
        key: "music_${track.id}",
      );
      // debugPrint("Downloaded music to: ${file.file.path}");
      return file.file.path;
    } catch (e) {
      // debugPrint("Playback catch error: $e");
      throw Exception("Failed to prepare track: $e");
    }
  }

  void _showDurationPicker(StateSetter setModalState) {
    _showManagedModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return Container(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                "Select Duration",
                style: TextStyle(
                  fontFamily: 'Outfit',
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 20),
              Wrap(
                spacing: 10,
                children: [15, 30, 45, 60, 90].map((seconds) {
                  final isSelected = _clipDurationSeconds == seconds;
                  return ChoiceChip(
                    label: Text("$seconds Seconds"),
                    selected: isSelected,
                    onSelected: (selected) {
                      if (selected) {
                        setState(() => _clipDurationSeconds = seconds);
                        setModalState(() {});
                        Navigator.pop(context);
                      }
                    },
                  );
                }).toList(),
              ),
              const SizedBox(height: 20),
            ],
          ),
        );
      },
    );
  }

  Widget _buildWaveformTrimmer(Music music, StateSetter setModalState) {
    final double viewportWidth = MediaQuery.of(context).size.width;
    const double pixelsPerSecond = 20.0;
    const double totalMusicSeconds = 30.0;

    final double selectionWidth = _clipDurationSeconds * pixelsPerSecond;
    final double sidePadding = (viewportWidth - selectionWidth) / 2;

    return Center(
      child: Column(
        children: [
          SizedBox(
            height: 100,
            child: Stack(
              alignment: Alignment.center,
              children: [
                // Scrollable Waveform
                NotificationListener<ScrollNotification>(
                  onNotification: (notification) {
                    if (notification is ScrollUpdateNotification) {
                      final double offset = _trimmerScrollController.offset;
                      double newStart = (offset / pixelsPerSecond).clamp(
                        0.0,
                        totalMusicSeconds - _clipDurationSeconds,
                      );
                      setModalState(() {
                        _clipStartSeconds = newStart;
                      });
                      _audioPlayer.seek(
                        Duration(milliseconds: (newStart * 1000).toInt()),
                      );
                    }
                    return true;
                  },
                  child: SingleChildScrollView(
                    controller: _trimmerScrollController,
                    scrollDirection: Axis.horizontal,
                    child: Padding(
                      padding: EdgeInsets.symmetric(horizontal: sidePadding),
                      child: Row(
                        children: List.generate(120, (index) {
                          return Container(
                            width: (pixelsPerSecond / 4) - 2,
                            height: (index % 12 + 5) * 4.0,
                            margin: const EdgeInsets.symmetric(horizontal: 1),
                            decoration: BoxDecoration(
                              color: Colors.grey[300],
                              borderRadius: BorderRadius.circular(1),
                            ),
                          );
                        }),
                      ),
                    ),
                  ),
                ),
                // Selection Window
                IgnorePointer(
                  child: Container(
                    width: selectionWidth,
                    height: 80,
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.blue, width: 2),
                      borderRadius: BorderRadius.circular(8),
                      gradient: LinearGradient(
                        colors: [
                          Colors.blue.withOpacity(0.1),
                          Colors.blue.withOpacity(0.05),
                        ],
                      ),
                    ),
                    child: Center(
                      child: Container(
                        width: 2,
                        height: 60,
                        color: Colors.redAccent,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Text(
            "Scroll the music bars to select part of the song",
            style: TextStyle(
              fontFamily: 'Outfit',
              fontSize: 12,
              color: Colors.grey,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMusicList(MusicState state, StateSetter setModalState) {
    if (state is MusicLoading) {
      return const Center(child: CircularProgressIndicator());
    } else if (state is MusicError) {
      return Center(child: Text(state.message));
    } else if (state is MusicLoaded) {
      if (state.tracks.isEmpty) {
        return const Center(child: Text("No music found"));
      }
      return ListView.builder(
        itemCount: state.tracks.length,
        itemBuilder: (context, index) {
          final music = state.tracks[index];
          final bool isCurrentlyPlaying =
              _audioPlayer.state == PlayerState.playing &&
              _currentlyPlayingId == music.id;

          return Container(
            margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 5),
            decoration: BoxDecoration(
              color: Colors.grey.withOpacity(0.05),
              borderRadius: BorderRadius.circular(12),
            ),
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 4,
              ),
              leading: Container(
                width: 45,
                height: 45,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  image: DecorationImage(
                    image: NetworkImage(music.coverUrl),
                    fit: BoxFit.cover,
                  ),
                ),
                child: _loadingMusicId == music.id
                    ? const Center(
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Icon(
                        isCurrentlyPlaying
                            ? Icons.pause_circle
                            : Icons.play_circle,
                        color: Colors.black54,
                        size: 28,
                      ),
              ),
              title: Text(
                music.title,
                style: TextStyle(
                  fontFamily: 'Outfit',
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: Text(
                "${music.artist} • ${music.duration}",
                style: TextStyle(
                  fontFamily: 'Outfit',
                  fontSize: 12,
                  color: Colors.grey,
                ),
              ),
              trailing: TextButton(
                onPressed: () async {
                  // debugPrint("Select clicked in Editor for: ${music.title}");

                  await _audioPlayer.stop();

                  setModalState(() {
                    _tempTrimmingMusic = music;
                    _isTrimmingMode = true;
                    _clipStartSeconds = 0.0;
                    _clipDurationSeconds = 15;
                    _loadingMusicId = music.id;
                  });

                  try {
                    final localPath = await _prepareTrack(music);
                    if (localPath != null && mounted) {
                      await _audioPlayer.play(DeviceFileSource(localPath));
                      _audioPlayer.setReleaseMode(ReleaseMode.loop);
                      setModalState(() {
                        _loadingMusicId = null;
                        _currentlyPlayingId = music.id;
                      });
                    }
                  } catch (e) {
                    // debugPrint("Editor Trimming error: $e");
                    setModalState(() => _loadingMusicId = null);
                  }
                },
                child: Text(
                  "Select",
                  style: TextStyle(
                    fontFamily: 'Outfit',
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
          );
        },
      );
    }
    return const Center(child: Text("Start searching for music"));
  }

  void _addMusicWidget(Music music) {
    _saveState();
    setState(() {
      final id = DateTime.now().millisecondsSinceEpoch.toString();
      _canvasWidgets.add(
        CanvasWidget(
          id: id,
          type: CanvasWidgetType.music,
          position: Offset(
            _canvasSize.width / 2 - 100,
            _canvasSize.height / 2 - 30,
          ),
          music: music,
        ),
      );
      _selectedWidgetId = id;
    });
  }

  bool _isLogoLayerName(String? layerName) {
    return layerName?.trim().toLowerCase() == 'logo';
  }

  bool _isImageLikeLayer(CanvasWidget widget) {
    return widget.type == CanvasWidgetType.logo ||
        widget.type == CanvasWidgetType.mobile ||
        (widget.imagePath != null && widget.imagePath!.trim().isNotEmpty);
  }

  String _layerSidebarTitle(CanvasWidget widget) {
    if (widget.type == CanvasWidgetType.text) {
      final String text = (widget.text ?? '').trim();
      return text.isEmpty ? 'text' : text;
    }
    if (_isImageLikeLayer(widget)) {
      return _isLogoLayerName(widget.name) ? 'logo' : 'image';
    }
    if (widget.type == CanvasWidgetType.music) return 'music';
    if (widget.type == CanvasWidgetType.video) return 'video';
    return widget.type.name;
  }

  Widget _buildLayerLeading(CanvasWidget widget, {required double size}) {
    if (_isImageLikeLayer(widget) &&
        widget.imagePath != null &&
        widget.imagePath!.trim().isNotEmpty) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.white, width: 1.5),
          boxShadow: <BoxShadow>[
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.12),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8.5),
          child: Image(
            image: _getImageProvider(widget.imagePath!),
            width: size,
            height: size,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => _buildLayerFallbackLeading(widget, size),
          ),
        ),
      );
    }
    return _buildLayerFallbackLeading(widget, size);
  }

  Widget _buildLayerFallbackLeading(CanvasWidget widget, double size) {
    final IconData iconData;
    final Color iconColor;
    switch (widget.type) {
      case CanvasWidgetType.text:
        iconData = Icons.text_fields_rounded;
        iconColor = const Color(0xFF6366F1);
        break;
      case CanvasWidgetType.logo:
      case CanvasWidgetType.mobile:
        iconData = Icons.image_outlined;
        iconColor = const Color(0xFF0EA5E9);
        break;
      case CanvasWidgetType.music:
        iconData = Icons.music_note_rounded;
        iconColor = const Color(0xFF8B5CF6);
        break;
      case CanvasWidgetType.video:
        iconData = Icons.videocam_rounded;
        iconColor = const Color(0xFFEF4444);
        break;
    }

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: iconColor.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: iconColor.withValues(alpha: 0.2)),
      ),
      child: Icon(iconData, color: iconColor, size: size * 0.48),
    );
  }

  Widget _buildEndDrawer() {
    final int layerCount = _canvasWidgets.length;

    return Drawer(
      width: min(MediaQuery.sizeOf(context).width * 0.82, 340),
      backgroundColor: const Color(0xFFF8F9FC),
      child: Column(
        children: <Widget>[
          Container(
            padding: const EdgeInsets.fromLTRB(18, 52, 12, 18),
            decoration: const BoxDecoration(
              gradient: AppGradients.brandHorizontal,
              borderRadius: BorderRadius.only(
                bottomLeft: Radius.circular(18),
                bottomRight: Radius.circular(18),
              ),
            ),
            child: Row(
              children: <Widget>[
                const GradientIcon(
                  Icons.layers_rounded,
                  size: 26,
                  gradient: LinearGradient(
                    colors: <Color>[Colors.white, Color(0xFFFFF3D6)],
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      const Text(
                        'Layers',
                        style: TextStyle(
                          fontFamily: 'Outfit',
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
              color: Colors.white,
                ),
            ),
                Text(
                        '$layerCount item${layerCount == 1 ? '' : 's'}',
                  style: TextStyle(
                    fontFamily: 'Outfit',
                          fontSize: 12,
                          color: Colors.white.withValues(alpha: 0.88),
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded, color: Colors.white),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          Expanded(
            child: layerCount == 0
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          Icon(
                            Icons.layers_clear_outlined,
                            size: 48,
                            color: Colors.grey.shade400,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'No layers yet',
                            style: TextStyle(
                              fontFamily: 'Outfit',
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                : ReorderableListView.builder(
                    itemCount: layerCount,
                    padding: const EdgeInsets.fromLTRB(14, 16, 14, 24),
                    onReorder: (int oldIndex, int newIndex) {
                setState(() {
                        final int actualOldIndex =
                            _canvasWidgets.length - 1 - oldIndex;
                        int actualNewIndex =
                            _canvasWidgets.length - 1 - newIndex;
                  if (newIndex > oldIndex) {
                    actualNewIndex += 1;
                  }
                        final CanvasWidget item =
                            _canvasWidgets.removeAt(actualOldIndex);
                  _canvasWidgets.insert(actualNewIndex, item);
                });
              },
                    itemBuilder: (BuildContext context, int index) {
                      final List<CanvasWidget> sortedWidgets =
                          _canvasWidgets.reversed.toList();
                      final CanvasWidget layerWidget = sortedWidgets[index];
                      final bool isSelected =
                          layerWidget.id == _selectedWidgetId;
                      final String layerTitle =
                          _layerSidebarTitle(layerWidget);

                return Padding(
                        key: ValueKey(layerWidget.id),
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Material(
                          color: Colors.transparent,
                          child: InkWell(
                            borderRadius: BorderRadius.circular(14),
                            onTap: _isUntouchableBackgroundLayer(layerWidget)
                                ? null
                                : () {
                                    if (_canvasCubit.isInteractionLocked) {
                                      return;
                                    }
                                    Navigator.pop(context);
                                    WidgetsBinding.instance.addPostFrameCallback(
                                      (_) {
                                        if (!mounted) return;
                                        _selectLayerAndOpenEditor(layerWidget);
                                      },
                                    );
                                  },
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 180),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 10,
                              ),
                      decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                                  color: isSelected
                                      ? const Color(0xFFE85D04)
                                      : Colors.grey.shade200,
                                  width: isSelected ? 2 : 1,
                                ),
                                boxShadow: <BoxShadow>[
                                  BoxShadow(
                                    color: isSelected
                                        ? const Color(0xFFE85D04)
                                            .withValues(alpha: 0.18)
                                        : Colors.black.withValues(alpha: 0.05),
                                    blurRadius: isSelected ? 10 : 6,
                                    offset: const Offset(0, 3),
                                  ),
                                ],
                      ),
                      child: Row(
                                children: <Widget>[
                                  _buildLayerLeading(layerWidget, size: 44),
                                  const SizedBox(width: 12),
                          Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: <Widget>[
                                        Text(
                                          layerTitle,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontFamily: 'Outfit',
                                            fontWeight: FontWeight.w700,
                                            fontSize: 14,
                                            color: isSelected
                                                ? const Color(0xFF1E1E3C)
                                                : const Color(0xFF374151),
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          'z-index ${layerWidget.zIndex}',
                                          style: TextStyle(
                                            fontFamily: 'Outfit',
                                            fontSize: 11,
                                            color: Colors.grey.shade500,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Icon(
                                    Icons.drag_handle_rounded,
                                    color: Colors.grey.shade400,
                                    size: 22,
                                  ),
                                ],
                              ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  // Legacy helper methods removed as FrameRenderer handles everything

  @override
  Widget build(BuildContext context) {
    return BlocProvider.value(
      value: _canvasCubit,
      child: BlocBuilder<CanvasEditorCubit, CanvasEditorState>(
        buildWhen: (CanvasEditorState previous, CanvasEditorState current) =>
            previous.revision != current.revision ||
            previous.selectedWidgetId != current.selectedWidgetId ||
            previous.interactionWidgetId != current.interactionWidgetId ||
            previous.backgroundColor != current.backgroundColor ||
            previous.backgroundGradient != current.backgroundGradient ||
            previous.backgroundImagePath != current.backgroundImagePath ||
            previous.selectedFrame != current.selectedFrame ||
            previous.selectedFrameJson != current.selectedFrameJson ||
            previous.isLoadingTemplate != current.isLoadingTemplate ||
            previous.templateLoadingPercent != current.templateLoadingPercent ||
            previous.canUndo != current.canUndo ||
            previous.canRedo != current.canRedo ||
            previous.isRotating != current.isRotating ||
            previous.currentRotation != current.currentRotation ||
            previous.canvasSize != current.canvasSize,
        builder: (BuildContext context, CanvasEditorState editorState) {
    return Stack(
      children: [
              IgnorePointer(
                ignoring: _isExporting || _isSharing,
                child: _buildScaffold(context),
              ),
              if (_isExporting || _isSharing)
                ExportProgressOverlay(progress: _exportProgress),
            ],
          );
        },
      ),
    );
  }

  Widget _buildScaffold(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: Colors.white,
      resizeToAvoidBottomInset: false,
      endDrawer: _buildEndDrawer(),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.black),
          onPressed: () {
            _stopMusic();
            Navigator.pop(context);
          },
        ),
        actions: [
          IconButton(
            icon: const GradientIcon(
              Icons.undo,
              gradient: AppGradients.brandHorizontal,
            ),
            onPressed: _editorCanUndo ? _undo : null,
            tooltip: 'Undo',
          ),
          IconButton(
            icon: const GradientIcon(
              Icons.redo,
              gradient: AppGradients.brandHorizontal,
            ),
            onPressed: _editorCanRedo ? _redo : null,
            tooltip: 'Redo',
          ),
          IconButton(
            icon: const GradientIcon(
              Icons.restart_alt,
              gradient: AppGradients.brandHorizontal,
            ),
            onPressed: _resetDesign,
            tooltip: 'Reset',
          ),
          IconButton(
            icon: const GradientIcon(
              Icons.share_outlined,
              gradient: AppGradients.brandHorizontal,
            ),
            onPressed: _isExporting || _isSharing ? null : _shareDesign,
            tooltip: "Share",
          ),
          IconButton(
            icon: const GradientIcon(
              Icons.download_outlined,
              gradient: AppGradients.brandHorizontal,
            ),
            onPressed: _isExporting || _isSharing ? null : _downloadDesign,
          ),
          Builder(
            builder: (context) => IconButton(
              icon: const GradientIcon(
                Icons.layers_outlined,
                gradient: AppGradients.brandHorizontal,
              ),
              onPressed: () => Scaffold.of(context).openEndDrawer(),
              tooltip: 'Layers',
            ),
          ),
        ],
      ),
      body: _isLoadingTemplate
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const CupertinoActivityIndicator(radius: 16),
                  const SizedBox(height: 12),
                  Text(
                    '${_templateLoadingPercent.toStringAsFixed(0)}%',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Colors.black87,
                    ),
                  ),
                ],
              ),
            )
          : Column(
              children: [
                // Canvas Preview Area
                SizedBox(
                  height: (_canvasSize.height >= 1920)
                      ? MediaQuery.of(context).size.height * 0.55
                      : MediaQuery.of(context).size.height * 0.60,
                  width: MediaQuery.of(context).size.width,
                  child: GestureDetector(
                    behavior: HitTestBehavior.translucent,
                    onTap: _handleEmptySpaceTap,
                  child: Align(
                    alignment: Alignment
                        .topCenter, // Align the virtual canvas to the top
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final double maxW = constraints.maxWidth * 0.90;
                        final double maxH = constraints.maxHeight;
                        final double canvasScale =
                            (maxW / _canvasSize.width <
                                maxH / _canvasSize.height)
                            ? (maxW / _canvasSize.width)
                            : (maxH / _canvasSize.height);

                        final double renderWidth =
                            _canvasSize.width * canvasScale;
                        final double renderHeight =
                            _canvasSize.height * canvasScale;

                        return Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                          child: SizedBox(
                            width: renderWidth,
                            height: renderHeight,
                            child: Container(
                              decoration: _isExporting
                                  ? const BoxDecoration(color: Colors.transparent)
                                  : BoxDecoration(
                                      color: Colors.black,
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                              child: ClipRRect(
                                borderRadius: _isExporting
                                    ? BorderRadius.zero
                                    : BorderRadius.circular(12),
                                child: Stack(
                                  clipBehavior: Clip.none,
                                  children: [
                                    RepaintBoundary(
                              key: _canvasKey,
                              child: FittedBox(
                                fit: BoxFit.contain,
                                child: SizedBox(
                                  width: _canvasSize.width,
                                  height: _canvasSize.height,
                                  child: Stack(
                                    key: _internalCanvasKey,
                                            clipBehavior: Clip.hardEdge,
                                            children: [
                                              RepaintBoundary(
                                                key: _templateSampleRepaintKey,
                                                child: Stack(
                                    clipBehavior: Clip.hardEdge,
                                    children: [
                                      // Background Layer
                                      Positioned.fill(
                                        child: GestureDetector(
                                                        onTap: _handleEmptySpaceTap,
                                          child: _isExporting
                                              ? Container(
                                                  color: Colors.transparent,
                                                )
                                              : Container(
                                                  decoration: BoxDecoration(
                                                    color: _backgroundColor,
                                                                  gradient: _backgroundGradient,
                                                                  image: _backgroundImagePath != null
                                                        ? DecorationImage(
                                                            image: _getImageProvider(
                                                              _backgroundImagePath!,
                                                            ),
                                                            fit: BoxFit.fill,
                                                          )
                                                        : null,
                                                  ),
                                                ),
                                        ),
                                      ),
                                                    // Main template layers (sampled by eyedropper).
                                                    ..._buildCanvasLayersFor(
                                                      isFromFrame: false,
                                                    ),
                                                    if (_selectedMusic != null && !_isExporting)
                                        Center(
                                          child: GestureDetector(
                                            onTap: _toggleCanvasMusicPlayback,
                                            child: Container(
                                              padding: const EdgeInsets.all(12),
                                              decoration: BoxDecoration(
                                                              color: Colors.black.withOpacity(0.4),
                                                shape: BoxShape.circle,
                                              ),
                                                            child: _isTogglingCanvasMusicPlayback
                                                  ? const SizedBox(
                                                      width: 42,
                                                      height: 42,
                                                                    child: CircularProgressIndicator(
                                                            strokeWidth: 2,
                                                            color: Colors.white,
                                                          ),
                                                    )
                                                  : Icon(
                                                                    _audioPlayer.state == PlayerState.playing
                                                          ? Icons.pause_rounded
                                                                        : Icons.play_arrow_rounded,
                                                      color: Colors.white,
                                                      size: 50,
                                                    ),
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                                              // Footer paint (non-interactive) + hit targets above.
                                              _buildFooterVirtualCanvasOverlay(),
                                              ..._buildCanvasLayersFor(
                                                isFromFrame: true,
                                                contentVisible: false,
                                              ),
                                              if (_isColorPencilVisible)
                                                Positioned(
                                                  left: _colorPencilCanvasOffset.dx,
                                                  top: _colorPencilCanvasOffset.dy,
                                                  child: IgnorePointer(
                                                    child: _buildEyedropperPencilVisual(),
                                                  ),
                                                ),
                                            ],
                                          ),
                    ),
                  ),
                ),
                                    if (_isColorPencilVisible)
                                      Positioned.fill(
                                        child: Listener(
                                          behavior: HitTestBehavior.translucent,
                                          onPointerDown: _handleEyedropperPointer,
                                          onPointerMove: _handleEyedropperPointer,
                                          onPointerUp: _handleEyedropperPointerUp,
                                          onPointerCancel: (_) => _finishEyedropperFromLastTip(),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  ),
                ),
                // Flexible tap target above the bottom toolbar.
                Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.translucent,
                    onTap: _handleEmptySpaceTap,
                    child: const SizedBox.expand(),
                  ),
                ),

                // Bottom Toolbar
                Container(
                  color: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _buildToolbarItem(
                        Icons.text_fields,
                        "Text",
                        onTap: _showAddTextBottomSheet,
                      ),
                      _buildToolbarItem(
                        Icons.image_outlined,
                        "Image",
                        onTap: _showAddMediaBottomSheet,
                      ),
                      _buildToolbarItem(
                        Icons.crop_free,
                        "Frames",
                        onTap: _openFrameStore,
                      ),
                      _buildToolbarItem(
                        Icons.music_note_outlined,
                        "Music",
                        onTap: _showMusicBottomSheet,
                      ),
                    ],
                  ),
                ),
                // Add safe area for bottom
                SizedBox(height: MediaQuery.of(context).padding.bottom),
              ],
            ),
    );
  }

  Widget _buildActionButton({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.grey[300]!),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 20, color: Colors.grey[700]),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                fontFamily: 'Outfit',
                fontSize: 14,
                color: Colors.grey[700],
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildToolbarItem(IconData icon, String label, {VoidCallback? onTap}) {
    return GestureDetector(
      onTap:
          onTap ??
          () {
            if (label == "Change Kit") {
              _showBrandKitBottomSheet();
            } else if (label == "Text") {
              _showAddTextBottomSheet();
            } else if (label == "Media") {
              _showAddMediaBottomSheet();
            } else if (label == "Background") {
              _showBackgroundBottomSheet();
            } else if (label == "Sticker") {
              _showStickerBottomSheet();
            }
          },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 24, color: Colors.grey[700]),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              fontFamily: 'Outfit',
              fontSize: 11,
              color: Colors.grey[700],
            ),
          ),
        ],
      ),
    );
  }

  void _showAddMediaBottomSheet() {
    _showManagedModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => Container(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  "Add Media",
                  style: TextStyle(
                    fontFamily: 'Outfit',
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: Colors.black,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: _buildBrandKitOption(
                    icon: Icons.camera_alt_rounded,
                    label: "Camera",
                    description: "Take a photo",
                    color: Colors.blue,
                    onTap: () {
                      _pickAndAddImage(ImageSource.camera);
                      Navigator.pop(context);
                    },
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: _buildBrandKitOption(
                    icon: Icons.photo_library_rounded,
                    label: "Gallery",
                    description: "Pick from gallery",
                    color: Colors.purple,
                    onTap: () {
                      _pickAndAddImage(ImageSource.gallery);
                      Navigator.pop(context);
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  void _showBackgroundBottomSheet() {
    _showManagedModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return DefaultTabController(
          length: 3,
          child: Container(
            height: 600,
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      "Background",
                      style: TextStyle(
                        fontFamily: 'Outfit',
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Container(
                  decoration: BoxDecoration(
                    color: Colors.grey[100],
                    borderRadius: BorderRadius.circular(25),
                  ),
                  child: TabBar(
                    indicator: BoxDecoration(
                      color: Colors.black,
                      borderRadius: BorderRadius.circular(25),
                    ),
                    labelColor: Colors.white,
                    unselectedLabelColor: Colors.black,
                    tabs: const [
                      Tab(text: "Photos"),
                      Tab(text: "Uploads"),
                      Tab(text: "Color"),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: TabBarView(
                    children: [
                      _buildPhotosTab(),
                      _buildUploadsTab(),
                      _buildColorTab(),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildPhotosTab() {
    return StatefulBuilder(
      builder: (context, setTabState) {
        final List<String> categories = [
          "Nature",
          "Agriculture",
          "Medical",
          "Wood",
          "Wall",
          "City",
          "Tech",
          "Abstract",
        ];

        // Mock images using LoremFlickr for category specific images
        final List<String> imageUrls = List.generate(
          12,
          (index) =>
              "https://loremflickr.com/300/300/${_currentPhotoCategory}?lock=$index",
        );

        return Column(
          children: [
            // Search Bar
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.grey[200],
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.search, color: Colors.grey),
                  const SizedBox(width: 8),
                  Text(
                    "Search by industry, product or service",
                    style: TextStyle(fontFamily: 'Outfit', color: Colors.grey),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Categories
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: categories.map((cat) {
                  final isSelected = cat == _currentPhotoCategory;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: GestureDetector(
                      onTap: () {
                        setTabState(() {
                          _currentPhotoCategory = cat;
                        });
                      },
                      child: Chip(
                        label: Text(cat),
                        backgroundColor: isSelected
                            ? Colors.blue
                            : Colors.grey[100],
                        labelStyle: TextStyle(
                          color: isSelected ? Colors.white : Colors.black,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 16),

            // Grid
            Expanded(
              child: GridView.builder(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3,
                  crossAxisSpacing: 8,
                  mainAxisSpacing: 8,
                ),
                key: ValueKey(
                  _currentPhotoCategory,
                ), // Force rebuild on category change
                itemCount: imageUrls.length,
                itemBuilder: (context, index) {
                  return GestureDetector(
                    onTap: () {
                      setState(() {
                        _backgroundImagePath = imageUrls[index];
                        _backgroundColor = Colors.white; // Reset color
                      });
                      Navigator.pop(context);
                    },
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.network(
                        imageUrls[index],
                        fit: BoxFit.cover,
                        loadingBuilder: (context, child, loadingProgress) {
                          if (loadingProgress == null) return child;
                          return Container(
                            color: Colors.grey[200],
                            child: const Center(
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          );
                        },
                        errorBuilder: (context, error, stackTrace) {
                          return Container(
                            color: Colors.grey[300],
                            child: const Icon(
                              Icons.broken_image,
                              color: Colors.grey,
                            ),
                          );
                        },
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildUploadsTab() {
    return Column(
      children: [
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: _buildBrandKitOption(
                icon: Icons.camera_alt_rounded,
                label: "Camera",
                description: "Take a photo",
                color: Colors.blue,
                onTap: () async {
                  final picker = ImagePicker();
                  final pickedFile = await picker.pickImage(
                    source: ImageSource.camera,
                  );
                  if (pickedFile != null) {
                    _saveState();
                    setState(() {
                      _backgroundImagePath = pickedFile.path;
                      _backgroundColor = Colors.white;
                    });
                    Navigator.pop(context);
                  }
                },
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: _buildBrandKitOption(
                icon: Icons.photo_library_rounded,
                label: "Gallery",
                description: "Pick from gallery",
                color: Colors.purple,
                onTap: () async {
                  final picker = ImagePicker();
                  final pickedFile = await picker.pickImage(
                    source: ImageSource.gallery,
                  );
                  if (pickedFile != null) {
                    _saveState();
                    setState(() {
                      _backgroundImagePath = pickedFile.path;
                      _backgroundColor = Colors.white;
                    });
                    Navigator.pop(context);
                  }
                },
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildColorTab() {
    final List<Color> colors = [
      Colors.white,
      Colors.black,
      Colors.red,
      Colors.pink,
      Colors.purple,
      Colors.deepPurple,
      Colors.indigo,
      Colors.blue,
      Colors.lightBlue,
      Colors.cyan,
      Colors.teal,
      Colors.green,
      Colors.lightGreen,
      Colors.lime,
      Colors.yellow,
      Colors.amber,
      Colors.orange,
      Colors.deepOrange,
      Colors.brown,
      Colors.grey,
      Colors.blueGrey,
    ];

    return GridView.builder(
      padding: const EdgeInsets.only(top: 20),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 5,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
      ),
      itemCount: colors.length,
      itemBuilder: (context, index) {
        return GestureDetector(
          onTap: () {
            _saveState();
            setState(() {
              _backgroundColor = colors[index];
              _backgroundImagePath = null; // Clear image
            });
            Navigator.pop(context);
          },
          child: Container(
            decoration: BoxDecoration(
              color: colors[index],
              shape: BoxShape.circle,
              border: Border.all(color: Colors.grey[300]!),
            ),
          ),
        );
      },
    );
  }

  void _showBrandKitBottomSheet() {
    _showManagedModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      builder: (context) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Drag Handle
            Center(
              child: Container(
                width: 48,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "Brand Kit",
                      style: TextStyle(
                        fontFamily: 'Outfit',
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Colors.black,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "Add your brand assets",
                      style: TextStyle(
                        fontFamily: 'Outfit',
                        fontSize: 14,
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close_rounded, color: Colors.grey),
                  padding: EdgeInsets.zero,
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
            const SizedBox(height: 32),

            // Options Grid
            Row(
              children: [
                Expanded(
                  child: _buildBrandKitOption(
                    icon: Icons.image_rounded,
                    label: "Logo",
                    description: "Import PNG/JPG",
                    color: Colors.blue,
                    onTap: () {
                      _addLogoWidget();
                      Navigator.pop(context);
                    },
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: _buildBrandKitOption(
                    icon: Icons.phone_iphone_rounded,
                    label: "Mobile",
                    description: "Contact Info",
                    color: Colors.green,
                    onTap: () {
                      _addMobileWidget();
                      Navigator.pop(context);
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Widget _buildBrandKitOption({
    required IconData icon,
    required String label,
    required String description,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.06),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
            BoxShadow(
              color: Colors.black.withOpacity(0.02),
              blurRadius: 4,
              offset: const Offset(0, 2),
            ),
          ],
          border: Border.all(color: Colors.grey[100]!),
        ),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 32, color: color),
            ),
            const SizedBox(height: 16),
            Text(
              label,
              style: TextStyle(
                fontFamily: 'Outfit',
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.black,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              description,
              style: TextStyle(
                fontFamily: 'Outfit',
                fontSize: 12,
                color: Colors.grey[500],
                fontWeight: FontWeight.w500,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Offset _getCenterOffset(double widgetWidth, double widgetHeight) {
    if (_canvasSize == Size.zero) return const Offset(100, 100);
    return Offset(
      (_canvasSize.width - widgetWidth) / 2,
      (_canvasSize.height - widgetHeight) / 2,
    );
  }

  Offset _getTopCenterOffset(double widgetWidth, double widgetHeight) {
    if (_canvasSize == Size.zero) return const Offset(100, 50);
    final double y = (_canvasSize.height * 0.12).clamp(40.0, 180.0);
    return Offset(
      (_canvasSize.width - widgetWidth) / 2,
      y,
    );
  }

  void _addLogoWidget() {
    _saveState();
    setState(() {
      _canvasWidgets.add(
        CanvasWidget(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          type: CanvasWidgetType.logo,
          position: _getCenterOffset(100, 100),
          scale: 1.0,
          zIndex: _nextZIndex,
        ),
      );
    });
  }

  void _addMobileWidget() {
    _saveState();
    setState(() {
      _canvasWidgets.add(
        CanvasWidget(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          type: CanvasWidgetType.mobile,
          // Estimating mobile widget size approx 150x50
          position: _getCenterOffset(150, 50),
          scale: 1.0,
          zIndex: _nextZIndex,
        ),
      );
    });
  }

  void _showAddTextBottomSheet() {
    final TextEditingController controller = TextEditingController();
    _showManagedModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).viewInsets.bottom + 20,
            left: 20,
            right: 20,
            top: 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Add Text',
                    style: TextStyle(
                      fontFamily: 'Outfit',
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.black87,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.grey),
                    onPressed: () => Navigator.pop(context),
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
              const SizedBox(height: 15),
              TextField(
                controller: controller,
                autofocus: true,
                style: const TextStyle(
                  fontFamily: 'Outfit',
                  fontSize: 16,
                  color: Colors.black87,
                ),
                decoration: InputDecoration(
                  hintText: 'Enter your text here...',
                  hintStyle: TextStyle(
                    fontFamily: 'Outfit',
                    color: Colors.grey[400],
                  ),
                  filled: true,
                  fillColor: Colors.grey[50],
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                ),
                maxLines: 3,
                minLines: 1,
              ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: Text(
                      'Cancel',
                style: TextStyle(
                  fontFamily: 'Outfit',
                        color: Colors.grey[600],
                  fontWeight: FontWeight.w600,
                ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  TextButton(
                    onPressed: () {
                      final String text = controller.text.trim();
                      if (text.isNotEmpty) {
                        _addTextToCanvas(text, 36, FontWeight.normal);
                      }
                      Navigator.pop(context);
                    },
                    child: const Text(
                      'OK',
                style: TextStyle(
                  fontFamily: 'Outfit',
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                        color: Colors.blueAccent,
                ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  void _addTextToCanvas(String text, double fontSize, FontWeight fontWeight) {
    _saveState();
    setState(() {
      String newId = DateTime.now().millisecondsSinceEpoch.toString();
      _canvasWidgets.add(
        CanvasWidget(
          id: newId,
          type: CanvasWidgetType.text,
          // Estimating text widget size approx 200x40 depending on text
          position: _getTopCenterOffset(200, 40),
          text: text,
          fontSize: fontSize,
          fontWeight: fontWeight,
          color: Colors.black,
          lineHeight: _kDefaultSoftWrappedLineHeight,
          zIndex: _nextZIndex,
        ),
      );
      _selectedWidgetId = newId;
    });
  }

  void _selectLayerAndOpenEditor(CanvasWidget widget) {
    if (!widget.isEditable) {
      setState(() {
        _selectedWidgetId = null;
      });
      return;
    }
    setState(() {
      _selectedWidgetId = widget.id;
    });
    _openLayerEditorSheet(widget);
  }

  void _openLayerEditorSheet(CanvasWidget widget) {
    if (widget.type == CanvasWidgetType.logo) {
      _resolveImageSourceDimensions(widget);
    }
    if (widget.isShapeRasterLayer && widget.isFromFrame) {
      _showShapeRasterColorPicker(widget);
    } else if (widget.type == CanvasWidgetType.logo) {
      _showLogoEditingBottomSheet(widget);
    } else if (widget.type == CanvasWidgetType.text) {
      _showTextEditingBottomSheet(widget);
    }
  }

  void _handleWidgetTap(CanvasWidget widget) {
    if (_isUntouchableBackgroundLayer(widget)) return;
    if (!_canvasCubit.canReceiveLayerTap(widget.id)) return;
    if (_canvasCubit.activeGestureHadMovement) return;
    _selectLayerAndOpenEditor(widget);
  }

  Future<void> _showShapeRasterColorPicker(CanvasWidget widget) async {
    final Color initialPickerColor =
        await _resolveTemplateBackgroundDefaultColor();
    if (!mounted) return;
    _showAdvancedColorPicker(
      widget,
      initialColor: initialPickerColor,
    );
  }

  Future<Uint8List?> _trimTransparency(Uint8List bytes) async {
    try {
      final img.Image? decoded = img.decodeImage(bytes);
      if (decoded == null) return bytes;

      int minX = decoded.width;
      int minY = decoded.height;
      int maxX = 0;
      int maxY = 0;
      bool found = false;

      // Manual Loop to find bounds with tolerance
      for (int y = 0; y < decoded.height; y++) {
        for (int x = 0; x < decoded.width; x++) {
          final pixel = decoded.getPixel(x, y);
          // Check alpha. In 'image' v4, alpha is the 4th channel
          if (pixel.a > 10) {
            // Tolerance for "almost" transparent pixels
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            found = true;
          }
        }
      }

      if (!found) return bytes; // Empty image

      // Add a small padding
      minX = (minX - 5).clamp(0, decoded.width);
      minY = (minY - 5).clamp(0, decoded.height);
      maxX = (maxX + 5).clamp(0, decoded.width - 1);
      maxY = (maxY + 5).clamp(0, decoded.height - 1);

      int w = maxX - minX + 1;
      int h = maxY - minY + 1;

      final img.Image trimmed = img.copyCrop(
        decoded,
        x: minX,
        y: minY,
        width: w,
        height: h,
      );
      return Uint8List.fromList(img.encodePng(trimmed));
    } catch (e) {
      // debugPrint("Transparency trim failed: $e");
      return bytes;
    }
  }

  Future<Uint8List?> _removeBackground(File imageFile) async {
    try {
      final useCase = sl<RemoveBackgroundUseCase>();
      final result = await useCase(
        RemoveBackgroundParams(imageFile: imageFile),
      );

      return await result.fold(
        (failure) {
          // debugPrint("Background removal failed: $failure");
          return null;
        },
        (bytes) async {
          // Trim transparency after removal
          return await _trimTransparency(bytes);
        },
      );
    } catch (e) {
      // debugPrint("Background removal exception: $e");
      return null;
    }
  }

  /// Simple yes/no prompt before optional background removal on a picked image.
  Future<bool?> _askRemoveBackgroundDialog() async {
    if (!mounted) return false;
    return showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: const Text('Remove background?'),
          content: const Text(
            'Do you want to remove the background from this image?',
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('No, keep it'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('Yes, remove'),
            ),
          ],
        );
      },
    );
  }

  /// Returns a local file path, optionally with background removed per user choice.
  Future<String> _finalizePickedImagePath(File imageFile) async {
    final bool? removeBg = await _askRemoveBackgroundDialog();
    if (removeBg != true) {
      return imageFile.path;
    }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
          content: Text('Removing background...'),
            duration: Duration(seconds: 2),
          ),
        );
      }

    final Uint8List? transparentBytes = await _removeBackground(imageFile);
      if (transparentBytes != null) {
      final Directory directory = await getTemporaryDirectory();
      final String timestamp = DateTime.now().millisecondsSinceEpoch.toString();
      final File transparentFile = File(
          '${directory.path}/transparent_$timestamp.png',
        );
        await transparentFile.writeAsBytes(transparentBytes);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Background removed successfully!')),
          );
        }
      return transparentFile.path;
    }

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
          content: Text('Could not remove background, using original.'),
            ),
          );
        }
    return imageFile.path;
  }

  Future<void> _pickAndAddImage(ImageSource source) async {
    final picker = ImagePicker();
    final pickedFile = await picker.pickImage(source: source);

    if (pickedFile != null) {
      if (!mounted) return;

      final File imageFile = File(pickedFile.path);
      final String finalPath = await _finalizePickedImagePath(imageFile);
      if (!mounted) return;

      double initWidth = 150;
      double initHeight = 150;

      final img.Image? decoded = await img.decodeImageFile(finalPath);
      if (decoded != null) {
        double aspectRatio = decoded.width / decoded.height;
        if (aspectRatio > 1) {
          initWidth = 200;
          initHeight = 200 / aspectRatio;
        } else {
          initHeight = 200;
          initWidth = 200 * aspectRatio;
        }
      }

      if (!mounted) return;
      _saveState();
      setState(() {
        String newId = DateTime.now().millisecondsSinceEpoch.toString();
        final String imagePath = finalPath;
        _canvasWidgets.add(
          CanvasWidget(
            id: newId,
            type: CanvasWidgetType.logo,
            position: _getCenterOffset(initWidth, initHeight),
            scale: 1.0,
            imagePath: imagePath,
            boxWidth: initWidth,
            boxHeight: initHeight,
            zIndex: _nextZIndex,
          ),
        );
        if (decoded != null) {
          _imageSourceDimensions['$newId|$imagePath'] = Size(
            decoded.width.toDouble(),
            decoded.height.toDouble(),
          );
        }
        _selectedWidgetId = newId;
      });
    }
  }

  CanvasWidget? _findCanvasWidgetById(String id) {
    for (final CanvasWidget item in _canvasWidgets) {
      if (item.id == id) return item;
    }
    return null;
  }

  bool _canMagicRemoveBackground(CanvasWidget widget) {
    final String? path = widget.imagePath?.trim();
    return path != null && path.isNotEmpty && !path.startsWith('http');
  }



  Widget _buildCompactIconButton({
    required IconData icon,
    required String label,
    required VoidCallback? onTap,
    bool enabled = true,
    bool isActive = false,
  }) {
    final Color iconColor = enabled
        ? (isActive ? Colors.blue : Colors.black87)
        : Colors.grey[400]!;

    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 22,
            height: 22,
            alignment: Alignment.center,
            child: Icon(icon, size: 22, color: iconColor),
          ),
          Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 1,
            style: TextStyle(
              fontFamily: 'Outfit',
              fontSize: 9,
              fontWeight: isActive ? FontWeight.w600 : FontWeight.w500,
              color: enabled
                  ? (isActive ? Colors.blue : Colors.black87)
                  : Colors.grey[400],
            ),
          ),
        ],
          ),
        );
      }

  Widget _buildCompactSliderRow({
    required String label,
    required double value,
    required double min,
    required double max,
    required String displayValue,
    required ValueChanged<double> onChanged,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              label,
              style: const TextStyle(
                fontFamily: 'Outfit',
                fontSize: 10,
                fontWeight: FontWeight.w500,
              ),
            ),
            Text(
              displayValue,
              style: TextStyle(
                fontFamily: 'Outfit',
                fontSize: 10,
                color: Colors.grey[600],
              ),
            ),
          ],
        ),
        const SizedBox(height: 2),
        SizedBox(
          height: 20,
          child: SliderTheme(
            data: SliderThemeData(
              trackHeight: 2,
              thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 5),
              overlayShape: const RoundSliderOverlayShape(overlayRadius: 10),
              activeTrackColor: Colors.black,
              inactiveTrackColor: Colors.grey[200],
              thumbColor: Colors.black,
            ),
            child: Slider(
              value: value.clamp(min, max),
              min: min,
              max: max,
              onChanged: onChanged,
            ),
          ),
        ),
      ],
    );
  }

  void _showFlipBottomSheet(
    BuildContext context,
    CanvasWidget widget,
    StateSetter parentSetState,
  ) {
    _showManagedModalBottomSheet(
      context: context,
      dismissActiveSheets: false,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setSubModalState) {
            return SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          "Flip Image",
                          style: TextStyle(
                            fontFamily: 'Outfit',
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        IconButton(
                          visualDensity: VisualDensity.compact,
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(
                            minWidth: 28,
                            minHeight: 28,
                          ),
                          icon: const Icon(Icons.close, size: 16),
                          onPressed: () => Navigator.pop(context),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        _buildCompactIconButton(
                          icon: Icons.flip,
                          label: 'Flip H',
                          isActive: widget.flipHorizontal,
                          onTap: () {
                            setSubModalState(() {
                              parentSetState(() {
                                setState(() {
                                  widget.flipHorizontal = !widget.flipHorizontal;
                                });
                              });
                            });
                          },
                        ),
                        _buildCompactIconButton(
                          icon: Icons.flip_camera_android,
                          label: 'Flip V',
                          isActive: widget.flipVertical,
                          onTap: () {
                            setSubModalState(() {
                              parentSetState(() {
                                setState(() {
                                  widget.flipVertical = !widget.flipVertical;
                                });
                              });
                            });
                          },
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  void _showArrangeBottomSheet(
    BuildContext context,
    CanvasWidget widget,
    StateSetter parentSetState,
  ) {
    _showManagedModalBottomSheet(
      context: context,
      dismissActiveSheets: false,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
      ),
      builder: (context) {
        return SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      "Arrange Layers",
                      style: TextStyle(
                        fontFamily: 'Outfit',
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    IconButton(
                      visualDensity: VisualDensity.compact,
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(
                        minWidth: 28,
                        minHeight: 28,
                      ),
                      icon: const Icon(Icons.close, size: 16),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _buildCompactIconButton(
                      icon: Icons.vertical_align_top,
                      label: 'To Front',
                      onTap: () {
                        setState(() {
                          _canvasWidgets.removeWhere(
                            (w) => w.id == widget.id,
                          );
                          _canvasWidgets.add(widget);
                        });
                        parentSetState(() {});
                      },
                    ),
                    _buildCompactIconButton(
                      icon: Icons.arrow_upward,
                      label: 'Forward',
                      onTap: () {
                        setState(() {
                          int index = _canvasWidgets.indexWhere(
                            (w) => w.id == widget.id,
                          );
                          if (index < _canvasWidgets.length - 1) {
                            final temp = _canvasWidgets.removeAt(index);
                            _canvasWidgets.insert(index + 1, temp);
                          }
                        });
                        parentSetState(() {});
                      },
                    ),
                    _buildCompactIconButton(
                      icon: Icons.arrow_downward,
                      label: 'Backward',
                      onTap: () {
                        setState(() {
                          int index = _canvasWidgets.indexWhere(
                            (w) => w.id == widget.id,
                          );
                          if (index > 0) {
                            final temp = _canvasWidgets.removeAt(index);
                            _canvasWidgets.insert(index - 1, temp);
                          }
                        });
                        parentSetState(() {});
                      },
                    ),
                    _buildCompactIconButton(
                      icon: Icons.vertical_align_bottom,
                      label: 'To Back',
                      onTap: () {
                        setState(() {
                          _canvasWidgets.removeWhere(
                            (w) => w.id == widget.id,
                          );
                          _canvasWidgets.insert(0, widget);
                        });
                        parentSetState(() {});
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _magicRemoveBackgroundForWidget(
    String widgetId, {
    required VoidCallback onStarted,
    required VoidCallback onFinished,
    VoidCallback? onUpdated,
  }) async {
    final CanvasWidget? target = _findCanvasWidgetById(widgetId);
    if (target == null || !_canMagicRemoveBackground(target)) return;

    onStarted();
    final Uint8List? bytes = await _removeBackground(File(target.imagePath!));
    if (bytes != null) {
      final Directory tempDir = await getTemporaryDirectory();
      final File tempFile = File(
        '${tempDir.path}/${DateTime.now().millisecondsSinceEpoch}.png',
      );
      await tempFile.writeAsBytes(bytes);
      if (!mounted) return;
      setState(() {
        final int index = _canvasWidgets.indexWhere((w) => w.id == widgetId);
        if (index != -1) {
          _canvasWidgets[index] = _canvasWidgets[index].copy(
            imagePath: tempFile.path,
          );
        }
      });
      onUpdated?.call();
    }
    onFinished();
  }

  Future<void> _pickImage(
    CanvasWidget currentWidget,
    ImageSource source, {
    VoidCallback? onUpdated,
  }) async {
    final picker = ImagePicker();
    final pickedFile = await picker.pickImage(source: source);
    if (pickedFile != null) {
      final File imageFile = File(pickedFile.path);
      final String finalPath = await _finalizePickedImagePath(imageFile);
      if (!mounted) return;

      // Preserve existing dimensions if they exist
      double newWidth = currentWidget.boxWidth ?? 150;
      double newHeight = currentWidget.boxHeight ?? 150;

      // Only calculate new dimensions if the current widget didn't have specific dimensions
      img.Image? decodedForDimensions;
      if (currentWidget.boxWidth == null && currentWidget.boxHeight == null) {
        decodedForDimensions = await img.decodeImageFile(finalPath);
        if (decodedForDimensions != null) {
          double aspectRatio =
              decodedForDimensions.width / decodedForDimensions.height;
          if (aspectRatio > 1) {
            newWidth = 200;
            newHeight = 200 / aspectRatio;
          } else {
            newHeight = 200;
            newWidth = 200 * aspectRatio;
          }
        }
      } else {
        decodedForDimensions = await img.decodeImageFile(finalPath);
      }

      if (!mounted) return;
      _saveState();
      setState(() {
        final index = _canvasWidgets.indexWhere(
          (w) => w.id == currentWidget.id,
        );
        if (index != -1) {
          _canvasWidgets[index] = currentWidget.copy(
            imagePath: finalPath,
            boxWidth: newWidth,
            boxHeight: newHeight,
          );
        }
        if (decodedForDimensions != null) {
          _imageSourceDimensions['${currentWidget.id}|$finalPath'] = Size(
            decodedForDimensions.width.toDouble(),
            decodedForDimensions.height.toDouble(),
          );
        }
      });
      onUpdated?.call();
    }
  }

  Future<void> _showLogoEditingBottomSheet(CanvasWidget widget) async {
    if (_isUntouchableBackgroundLayer(widget)) return;
    await _dismissActiveBottomSheets();
    if (!mounted) return;
    bool isRemovingBg = false;
    setState(() {
      _selectedWidgetId = widget.id;
      _isEditingBottomSheetOpen = true;
    });

    final PersistentBottomSheetController? sheetController =
        _scaffoldKey.currentState?.showBottomSheet(
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            if (isRemovingBg) {
              return Container(
                height: 360,
                child: const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      CircularProgressIndicator(),
                      SizedBox(height: 20),
                      Text("Removing Background..."),
                    ],
                  ),
                ),
              );
            }

            return Container(
              color: Colors.white,
              padding: const EdgeInsets.only(top: 8, left: 16, right: 16, bottom: 20),
              height: 232,
              child: SingleChildScrollView(
                physics: const ClampingScrollPhysics(),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Header (left title must flex-wrap on narrow sheets)
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              IconButton(
                                padding: EdgeInsets.zero,
                                constraints: const BoxConstraints(
                                  minWidth: 40,
                                  minHeight: 40,
                                ),
                                icon: const Icon(Icons.close),
                                onPressed: () => Navigator.pop(context),
                              ),
                              Expanded(
                              child: const SizedBox.shrink(),
                              ),
                            ],
                          ),
                        ),
                        // Right Side Controls
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.delete_outline),
                              onPressed: () {
                              if (widget.isFromFrame) {
                                _deleteEntireFooter();
                              } else {
                                setState(() {
                                  _canvasWidgets.removeWhere(
                                    (w) => w.id == widget.id,
                                  );
                                  _selectedWidgetId = null;
                                });
                              }
                                Navigator.pop(context);
                              },
                            ),
                            Container(
                              height: 40,
                              width: 1,
                              color: Colors.grey[300],
                            ),
                            const SizedBox(width: 8),
                          _buildNudgeControl(targetWidgetId: widget.id),
                          ],
                        ),
                      ],
                    ),
                  const SizedBox(height: 6),

                  // Row of 5 Action Buttons: Camera, Gallery, Remove BG, Flip, Arrange
                  Builder(
                    builder: (BuildContext context) {
                      final CanvasWidget mediaWidget =
                          _findCanvasWidgetById(widget.id) ?? widget;
                      final bool canRemoveBg =
                          _canMagicRemoveBackground(mediaWidget);

                      return Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          _buildCompactIconButton(
                            icon: Icons.camera_alt,
                            label: 'Camera',
                            onTap: () => _pickImage(
                              mediaWidget,
                              ImageSource.camera,
                              onUpdated: () => setModalState(() {}),
                            ),
                          ),
                          _buildCompactIconButton(
                            icon: Icons.photo_library,
                            label: 'Gallery',
                            onTap: () => _pickImage(
                              mediaWidget,
                              ImageSource.gallery,
                              onUpdated: () => setModalState(() {}),
                            ),
                          ),
                          _buildCompactIconButton(
                            icon: Icons.auto_fix_high,
                            label: 'Remove BG',
                            enabled: canRemoveBg,
                            onTap: () {
                              unawaited(
                                _magicRemoveBackgroundForWidget(
                                  widget.id,
                                  onStarted: () => setModalState(
                                    () => isRemovingBg = true,
                                  ),
                                  onFinished: () => setModalState(
                                    () => isRemovingBg = false,
                                  ),
                                  onUpdated: () =>
                                      setModalState(() {}),
                                ),
                              );
                            },
                          ),
                          _buildCompactIconButton(
                            icon: Icons.flip,
                            label: 'Flip',
                            isActive: widget.flipHorizontal || widget.flipVertical,
                            onTap: () => _showFlipBottomSheet(context, widget, setModalState),
                          ),
                          _buildCompactIconButton(
                            icon: Icons.layers,
                            label: 'Arrange',
                            onTap: () => _showArrangeBottomSheet(context, widget, setModalState),
                          ),
                        ],
                      );
                    },
                  ),
                  const SizedBox(height: 8),

                  // 2-Column Sliders: Scale, Rotation, Opacity, Brightness, Contrast
                  Row(
                                        children: [
                      Expanded(
                        child: _buildCompactSliderRow(
                          label: 'Scale',
                                          value: widget.scale,
                                          min: 0.1,
                                          max: 3.0,
                          displayValue: '${(widget.scale * 100).toInt()}%',
                                          onChanged: (value) {
                                            setModalState(() {
                                              setState(() {
                                                widget.scale = value;
                                              });
                                            });
                                          },
                                        ),
                                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: _buildCompactSliderRow(
                          label: 'Rotation',
                          value: _normalizeAngle(widget.rotation),
                          min: -pi,
                          max: pi,
                          displayValue: '${(widget.rotation * 180 / 3.14159).toInt()}°',
                          onChanged: (value) {
                            setModalState(() {
                                          setState(() {
                                widget.rotation = value;
                                _canvasCubit.updateCurrentRotation(value);
                              });
                            });
                          },
                                    ),
                                  ),
                              ],
                            ),
                  const SizedBox(height: 8),

                  Row(
                            children: [
                      Expanded(
                        child: _buildCompactSliderRow(
                          label: 'Opacity',
                                value: widget.opacity,
                                min: 0.0,
                                max: 1.0,
                          displayValue: '${(widget.opacity * 100).toInt()}%',
                                onChanged: (value) {
                                  setModalState(() {
                                    setState(() {
                                      widget.opacity = value;
                                    });
                                  });
                                },
                              ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: _buildCompactSliderRow(
                          label: 'Brightness',
                          value: widget.brightness,
                          min: 0.5,
                          max: 1.5,
                          displayValue: widget.brightness.toStringAsFixed(1),
                          onChanged: (value) {
                            setModalState(() {
                                      setState(() {
                                widget.brightness = value;
                              });
                                      });
                                    },
                                          ),
                                        ),
                                      ],
                                    ),
                  const SizedBox(height: 8),

                  Row(
                                children: [
                      Expanded(
                        child: _buildCompactSliderRow(
                          label: 'Contrast',
                                    value: widget.contrast,
                                    min: 0.5,
                                    max: 1.5,
                          displayValue: widget.contrast.toStringAsFixed(1),
                          onChanged: (value) {
                                      setModalState(() {
                              setState(() {
                                widget.contrast = value;
                              });
                                      });
                                    },
                                  ),
                              ),
                      const SizedBox(width: 16),
                      const Expanded(
                        child: SizedBox.shrink(),
                          ),
                        ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    _activePersistentBottomSheetController = sheetController;
    sheetController?.closed.whenComplete(() {
      if (!mounted) return;
      setState(() {
        if (identical(_activePersistentBottomSheetController, sheetController)) {
          _activePersistentBottomSheetController = null;
        }
        _isEditingBottomSheetOpen = false;
        if (_selectedWidgetId == widget.id) {
          _selectedWidgetId = null;
        }
      });
    });
  }



  List<double> _getColorMatrix(
    double brightness,
    double contrast,
    bool grayscale,
    bool sepia,
  ) {
    double b = (brightness - 1.0);
    double c = contrast;
    double offset = (1.0 - c) * 128 + b * 255;

    List<double> matrix = [
      c,
      0,
      0,
      0,
      offset,
      0,
      c,
      0,
      0,
      offset,
      0,
      0,
      c,
      0,
      offset,
      0,
      0,
      0,
      1,
      0,
    ];

    if (grayscale) {
      matrix = _multiplyMatrices(matrix, [
        0.2126,
        0.7152,
        0.0722,
        0,
        0,
        0.2126,
        0.7152,
        0.0722,
        0,
        0,
        0.2126,
        0.7152,
        0.0722,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
      ]);
    }

    if (sepia) {
      matrix = _multiplyMatrices(matrix, [
        0.393,
        0.769,
        0.189,
        0,
        0,
        0.349,
        0.686,
        0.168,
        0,
        0,
        0.272,
        0.534,
        0.131,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
      ]);
    }

    return matrix;
  }

  List<double> _multiplyMatrices(List<double> m1, List<double> m2) {
    List<double> result = List.filled(20, 0.0);
    for (int y = 0; y < 4; y++) {
      for (int x = 0; x < 5; x++) {
        double sum = 0;
        for (int i = 0; i < 4; i++) {
          sum += m1[y * 5 + i] * m2[i * 5 + x];
        }
        if (x == 4) sum += m1[y * 5 + 4];
        result[y * 5 + x] = sum;
      }
    }
    return result;
  }

  /// Normalizes to opaque sRGB so [Color.lerp] / tint tweens never throw.
  static Color _normalizeFooterTintColor(Color color) {
    return Color.fromARGB(255, color.red, color.green, color.blue);
  }

  /// Shape rasters tint only when JSON provides an explicit color (footer masks).
  /// `color: null` must render the PNG as-is — never coerce to black via srcIn.
  bool _shapeRasterLayerShouldTint(Color color) => color.alpha > 0;

  /// Logo image, or raster `type: shape` tinted with [CanvasWidget.color].
  Widget _buildLogoOrShapeRasterChild(CanvasWidget widget) {
    if (widget.imagePath == null) {
      return const Icon(Icons.image);
    }

    Widget raster = Image(
      image: _getImageProvider(widget.imagePath!),
      fit: widget.boxFit,
      alignment: widget.alignment,
      errorBuilder: (context, error, stackTrace) =>
          const Icon(Icons.broken_image),
    );

    if (widget.isShapeRasterLayer && !widget.isClipped) {
      if (!_shapeRasterLayerShouldTint(widget.color)) {
        return raster;
      }

      final _ShapeTintAnimation? tintAnimation =
          _activeShapeTintAnimation?.widgetId == widget.id
          ? _activeShapeTintAnimation
          : null;
      final Color tint = _normalizeFooterTintColor(widget.color);

      Widget tintedChild(Widget child, Color color) {
        if (!_shapeRasterLayerShouldTint(color)) {
          return child;
        }
        final Color normalized = _normalizeFooterTintColor(color);
        return ColorFiltered(
          colorFilter: ColorFilter.mode(normalized, BlendMode.srcIn),
          child: child,
        );
      }

      if (tintAnimation != null) {
        final Color from = _normalizeFooterTintColor(tintAnimation.from);
        final Color to = _normalizeFooterTintColor(tintAnimation.to);
        return TweenAnimationBuilder<double>(
          key: ValueKey<String>(
            'shape-tint-${widget.id}-${from.value}-${to.value}',
          ),
          tween: Tween<double>(begin: 0, end: 1),
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOutCubic,
          onEnd: () {
            if (!mounted) return;
            if (_activeShapeTintAnimation?.widgetId == widget.id) {
              setState(() => _activeShapeTintAnimation = null);
            }
          },
          builder: (BuildContext context, double t, Widget? child) {
            final Color? animated = Color.lerp(from, to, t);
            return tintedChild(child ?? raster, animated ?? to);
          },
          child: raster,
        );
      }

      return tintedChild(raster, tint);
    }

    return raster;
  }

  Widget _buildCanvasWidget(CanvasWidget widget) {
    switch (widget.type) {
      case CanvasWidgetType.logo:
        if (widget.isShapeRasterLayer && !widget.isFromFrame) {
          Widget raster = _buildLogoOrShapeRasterChild(widget);
          if (widget.boxWidth != null && widget.boxHeight != null) {
            raster = _clipWidgetToLayerMaskShape(
              widget: widget,
              child: raster,
              maskRect: Rect.fromLTWH(
                0,
                0,
                widget.boxWidth!,
                widget.boxHeight!,
              ),
            );
            return SizedBox(
              width: widget.boxWidth,
              height: widget.boxHeight,
              child: raster,
            );
          }
          return raster;
        }

        final String normalizedShape = widget.shape.toLowerCase();
        final bool isCircle = _layerShapeIsEllipse(normalizedShape);
        final bool isRectangleShape =
            normalizedShape.isEmpty || normalizedShape == 'rectangle';
        final BorderRadius? radius = widget.isFromFrame
            ? (isRectangleShape ? _resolvedLayerCornerRadii(widget) : null)
            : _resolvedLayerCornerRadii(widget);
        final bool drawBorder = widget.borderWidth > 0 &&
            !(widget.isShapeRasterLayer && widget.imagePath != null);

        final Widget logoContent = Container(
          width: widget.boxWidth,
          height: widget.boxHeight,
          decoration: BoxDecoration(
            color: widget.backgroundColor ?? Colors.transparent,
            shape: isCircle ? BoxShape.circle : BoxShape.rectangle,
            borderRadius: isCircle ? null : radius,
            gradient: widget.textGradient,
            border: drawBorder
                ? Border.all(
                    color: widget.borderColor,
                    width: widget.borderWidth,
                  )
                : null,
          ),
          clipBehavior: (isCircle || radius != null) ? Clip.antiAlias : Clip.none,
          child: _buildLogoOrShapeRasterChild(widget),
        );

        if (widget.boxWidth != null && widget.boxHeight != null) {
          return SizedBox(
            width: widget.boxWidth,
            height: widget.boxHeight,
            child: logoContent,
          );
        }

        return logoContent;

      case CanvasWidgetType.text:
        final String transformedText = _prepareTextForSafeWrapping(
          _applyTextTransform(
            widget.text ?? 'Text',
            widget.textTransform,
            widget.isUpperCase,
          ),
        );
        final ({double? height, TextHeightBehavior? textHeightBehavior})
            typography = _resolveTextTypography(widget, transformedText);
        TextStyle textStyle = _getSafeTextStyle(
          fontFamily: widget.fontFamily ?? 'Outfit',
          fontSize: widget.fontSize,
          // Single-line text uses neutral leading; wrapped multi-line uses tight
          // leading; explicit line breaks use template/user line height.
          height: typography.height,
          fontWeight: widget.fontWeight,
          fontStyle: widget.fontStyle,
          decoration: widget.decoration,
          color: widget.color,
          letterSpacing: widget.letterSpacing,
          shadows:
              widget.shadows ??
              (widget.hasShadow
                  ? [
                      Shadow(
                        blurRadius: 2.0,
                        color: Colors.black.withOpacity(0.3),
                        offset: const Offset(1, 1),
                      ),
                    ]
                  : null),
        );
        if (widget.id == _selectedWidgetId) {
          textStyle = textStyle.copyWith(backgroundColor: Colors.black.withOpacity(0.3));
        }
        if (widget.isAutoFitText &&
            widget.boxWidth != null &&
            widget.boxHeight != null) {
          textStyle = _fitTextStyleToLayerBox(
            text: transformedText,
            baseStyle: textStyle,
            boxWidth: widget.boxWidth!,
            boxHeight: widget.boxHeight!,
            textAlign: widget.textAlign,
          );
        }

        final bool isAddress = widget.isFromFrame &&
            widget.role == FooterBusinessProfileBinder.addressFieldId;
        final bool useIntrinsicTemplateText =
            _templateTextUsesIntrinsicSize(widget);
        final double? boxWidth = widget.isFromFrame && !isAddress
            ? _measureRenderedTextSize(widget, transformedText).width
            : widget.boxWidth;
        final double? boxHeight = widget.isFromFrame && !isAddress
            ? _measureRenderedTextSize(widget, transformedText).height
            : widget.boxHeight;
        final bool hasFixedLayerSize = !useIntrinsicTemplateText &&
            boxWidth != null &&
            boxHeight != null;

        Widget textChild;
        if (widget.warp != null && widget.warp!['style'] == 'arc') {
          textChild = SizedBox(
            width: widget.boxWidth ?? 300,
            height: widget.boxHeight ?? 100,
            child: WarpedText(
              text: transformedText,
              style: textStyle,
              warp: widget.warp!,
              textAlign: widget.textAlign,
            ),
          );
        } else {
          final bool isFooterAddressLayer = widget.isFromFrame &&
              widget.role == FooterBusinessProfileBinder.addressFieldId;
          final bool isVisibleOverflow = widget.isFromFrame &&
              (widget.role == FooterBusinessProfileBinder.websiteFieldId ||
               isFooterAddressLayer);
          textChild = Text(
            key: ValueKey<String>(
              '${widget.id}|${widget.fontFamily}|${_extractPrimaryTtfUrl(widget.fontUrls) ?? ''}|$_fontRenderVersion',
            ),
            transformedText,
            style: textStyle,
            textAlign: isFooterAddressLayer ? TextAlign.left : widget.textAlign,
            softWrap: widget.softWrap,
            overflow:
                isVisibleOverflow ? TextOverflow.visible : TextOverflow.clip,
            textWidthBasis: TextWidthBasis.longestLine,
            maxLines: widget.maxLines ?? (widget.softWrap ? null : 1),
            textHeightBehavior: typography.textHeightBehavior,
          );
        }

        if (useIntrinsicTemplateText) {
          final Size textSize =
              _measureRenderedTextSize(widget, transformedText);
          final double alignOffsetX =
              _templateTextAlignOffsetX(widget, textSize.width);
          final Offset baselineOffset =
              _canvasWidgetBaselineShiftOffset(widget);
          textChild = Transform.translate(
            offset: Offset(alignOffsetX + baselineOffset.dx, baselineOffset.dy),
            child: textChild,
          );
        } else {
          textChild = _applyWidgetBaselineShift(textChild, widget);
        }

        if (widget.textGradient != null) {
          textChild = ShaderMask(
            shaderCallback: (Rect bounds) =>
                widget.textGradient!.createShader(bounds),
            blendMode: BlendMode.srcIn,
            child: textChild,
          );
        }

        final EdgeInsets layerPadding = EdgeInsets.zero;

        if (useIntrinsicTemplateText) {
          return Container(
            padding: layerPadding,
            decoration: widget.backgroundColor != null || widget.borderWidth > 0
                ? BoxDecoration(
                    color: widget.backgroundColor,
                    borderRadius: BorderRadius.circular(
                      widget.borderRadius > 0 ? widget.borderRadius : 4,
                    ),
                    border: widget.borderWidth > 0
                        ? Border.all(
                            color: widget.borderColor,
                            width: widget.borderWidth,
                          )
                        : null,
                  )
                : null,
            child: textChild,
          );
        }

        Widget layerChild = (widget.isClipped)
            ? ClipRect(
                child: hasFixedLayerSize
                    ? (widget.isAutoFitText
                          ? SizedBox.expand(
                              child: FittedBox(
                                fit: widget.boxFit,
                                alignment: Alignment.center,
                                child: textChild,
                              ),
                            )
                          : SizedBox.expand(child: textChild))
                    : textChild,
              )
            : (hasFixedLayerSize
                  ? (widget.isAutoFitText
                        ? SizedBox.expand(
                            child: FittedBox(
                              fit: widget.boxFit,
                              alignment: Alignment.center,
                              child: textChild,
                            ),
                          )
                        : SizedBox.expand(child: textChild))
                  : textChild);

        final Widget layerBox = Container(
          padding: layerPadding,
          decoration: widget.backgroundColor != null || widget.borderWidth > 0
              ? BoxDecoration(
                  color: widget.backgroundColor,
                  borderRadius: BorderRadius.circular(
                    widget.borderRadius > 0 ? widget.borderRadius : 4,
                  ),
                  border: widget.borderWidth > 0
                      ? Border.all(
                          color: widget.borderColor,
                          width: widget.borderWidth,
                        )
                      : null,
                )
              : null,
          child: layerChild,
        );

        // Pin stack/selection bounds to the layer's w/h from JSON.
        if (hasFixedLayerSize) {
          return SizedBox(
            width: boxWidth,
            height: boxHeight,
            child: layerBox,
          );
        }

        return Container(
          constraints: BoxConstraints(
            maxWidth: widget.boxWidth ?? (_canvasSize.width - 20),
          ),
          child: layerBox,
        );

      case CanvasWidgetType.video:
        final controller = _stickerVideoControllers[widget.id];
        return Container(
          width: 150,
          height: 150,
          decoration: BoxDecoration(
            color: Colors.black,
            borderRadius: BorderRadius.circular(12),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: controller != null && controller.value.isInitialized
                ? AspectRatio(
                    aspectRatio: controller.value.aspectRatio,
                    child: VideoPlayer(controller),
                  )
                : const Center(
                    child: CircularProgressIndicator(color: Colors.white),
                  ),
          ),
        );

      case CanvasWidgetType.mobile:
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.blue[700]!, width: 2),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.1),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.phone, size: 20, color: Colors.blue[700]),
              const SizedBox(width: 8),
              Text(
                '+91 98765 43210',
                style: TextStyle(
                  fontFamily: 'Outfit',
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Colors.black87,
                ),
              ),
            ],
          ),
        );

      case CanvasWidgetType.music:
        return const SizedBox.shrink();
    }
  }

  Offset _rotateVector(Offset vector, double angle) {
    final cosA = cos(angle);
    final sinA = sin(angle);
    return Offset(
      vector.dx * cosA - vector.dy * sinA,
      vector.dx * sinA + vector.dy * cosA,
    );
  }

  void handleResizeStart(String widgetId) =>
      _canvasCubit.handleResizeStart(widgetId);

  void handleResizeEnd() => _canvasCubit.handleResizeEnd();

  void _handleResize(
    CanvasWidget widget,
    String handle,
    DragUpdateDetails details,
  ) {
    _canvasCubit.mutateCanvas(() {
      final double angle = widget.rotation;
      final double scale = widget.scale;

      final Offset localDelta = _rotateVector(details.delta, -angle) / scale;

      double dx = localDelta.dx;
      double dy = localDelta.dy;

      double newWidth = widget.boxWidth ?? 100;
      double newHeight = widget.boxHeight ?? 100;
      double aspectRatio = newWidth / newHeight;
      Offset newPos = widget.position;

      // Determine if this is a corner handle
      bool isCorner =
          (handle.contains('Left') || handle.contains('Right')) &&
          (handle.contains('Top') || handle.contains('Bottom'));

      if (isCorner) {
        // Enforce Aspect Ratio on Corners
        if (handle.contains('Right')) {
          if (newWidth + dx > 20) {
            newWidth += dx;
            double targetHeight = newWidth / aspectRatio;
            double heightChange = targetHeight - newHeight;

            // Apply corresponding height change based on vertical handle position
            if (handle.contains('Bottom')) {
              newHeight = targetHeight;
              dy = heightChange; // Virtual dy
            } else if (handle.contains('Top')) {
              newHeight = targetHeight;
              dy =
                  -heightChange; // Virtual dy, inverted because top moves opposite
            }

            final shift = _rotateVector(Offset(dx / 2, 0), angle) * scale;
            newPos += shift;
          }
        } else if (handle.contains('Left')) {
          if (newWidth - dx > 20) {
            newWidth -= dx;
            double targetHeight = newWidth / aspectRatio;
            double heightChange = targetHeight - newHeight;

            if (handle.contains('Bottom')) {
              newHeight = targetHeight;
              dy = heightChange;
            } else if (handle.contains('Top')) {
              newHeight = targetHeight;
              dy = -heightChange;
            }

            final shift = _rotateVector(Offset(dx / 2, 0), angle) * scale;
            newPos += shift;
          }
        }

        // Correct position for Y-axis changes derived from X-axis changes (aspect ratio)
        if (handle.contains('Bottom')) {
          final shiftY = _rotateVector(Offset(0, dy / 2), angle) * scale;
          newPos += shiftY;
        } else if (handle.contains('Top')) {
          final shiftY = _rotateVector(Offset(0, dy / 2), angle) * scale;
          newPos += shiftY;
        }
      } else {
        // Proportional resize for side handles (same as diagonal corners).
        const double minSize = 20;
        final bool isHorizontalSide =
            (handle.contains('Left') || handle.contains('Right')) &&
            !handle.contains('Top') &&
            !handle.contains('Bottom');
        final bool isVerticalSide =
            (handle.contains('Top') || handle.contains('Bottom')) &&
            !handle.contains('Left') &&
            !handle.contains('Right');

        if (isHorizontalSide) {
          final double candidateWidth = handle.contains('Right')
              ? newWidth + dx
              : newWidth - dx;
          if (candidateWidth < minSize) {
            return;
          }
          final double scaleFactor = candidateWidth / newWidth;
          final double heightChange = newHeight * scaleFactor - newHeight;
          newWidth = candidateWidth;
          newHeight = newHeight * scaleFactor;
          newPos += _rotateVector(
            Offset(dx / 2, -heightChange / 2),
            angle,
          ) *
              scale;
        } else if (isVerticalSide) {
          final double candidateHeight = handle.contains('Bottom')
              ? newHeight + dy
              : newHeight - dy;
          if (candidateHeight < minSize) {
            return;
          }
          final double scaleFactor = candidateHeight / newHeight;
          final double widthChange = newWidth * scaleFactor - newWidth;
          newHeight = candidateHeight;
          newWidth = newWidth * scaleFactor;
          newPos += _rotateVector(
            Offset(-widthChange / 2, dy / 2),
            angle,
          ) *
              scale;
        }
      }

      widget.boxWidth = newWidth;
      widget.boxHeight = newHeight;
      widget.position = newPos;
      _clampWidgetInCanvas(widget);
    });
  }

  void _handleRotationStart(CanvasWidget widget, DragStartDetails details) {
    handleResizeStart(widget.id);

    _canvasCubit.setRotating(rotating: true, rotation: widget.rotation);

    final RenderBox? box =
        _internalCanvasKey.currentContext?.findRenderObject() as RenderBox?;
    if (box != null) {
      final Offset touch = box.globalToLocal(details.globalPosition);
      // Center of widget in Canvas Coordinates (scale is handled by Transform alignment)
      final double unscaledWidth = (widget.boxWidth ?? 100);
      final double unscaledHeight = (widget.boxHeight ?? 100);
      final Offset center =
          widget.position + Offset(unscaledWidth / 2, unscaledHeight / 2);

      // Store the initial touch angle
      _lastTouchAngle = atan2(touch.dy - center.dy, touch.dx - center.dx);
    } else {}
  }

  void _handleRotationUpdate(CanvasWidget widget, DragUpdateDetails details) {
      final RenderBox? box =
          _internalCanvasKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;

        final Offset touch = box.globalToLocal(details.globalPosition);
        final double unscaledWidth = (widget.boxWidth ?? 100);
        final double unscaledHeight = (widget.boxHeight ?? 100);
        final Offset center =
            widget.position + Offset(unscaledWidth / 2, unscaledHeight / 2);

        final double currentAngle = atan2(
          touch.dy - center.dy,
          touch.dx - center.dx,
        );

        double delta = currentAngle - _lastTouchAngle;
        if (delta > pi) {
          delta -= 2 * pi;
        } else if (delta < -pi) {
          delta += 2 * pi;
        }

    _canvasCubit.updateCurrentRotation(_currentRotation + delta);
        _lastTouchAngle = currentAngle;
  }

  void _handleRotationEnd(CanvasWidget widget) {
    handleResizeEnd();
      widget.rotation = _currentRotation;
    _canvasCubit.setRotating(rotating: false, rotation: widget.rotation);
      _clampWidgetInCanvas(widget);
    _notifyCanvasChanged();
  }

  double _normalizeAngle(double angle) {
    double normalized = angle % (2 * pi);
    if (normalized > pi) {
      normalized -= 2 * pi;
    } else if (normalized < -pi) {
      normalized += 2 * pi;
    }
    return normalized;
  }

  Widget _wrapLayerWithTextStretchTransform(
    CanvasWidget widget,
    Widget child,
  ) {
    final bool isStretching = widget.type == CanvasWidgetType.text &&
        widget.id == _textStretchWidgetId &&
        _textStretchVisualScale != 1.0;
    if (!isStretching) return child;
    return Transform.scale(
      scale: _textStretchVisualScale,
      alignment: Alignment.center,
      child: child,
    );
  }

  void _handleTextStretchStart(CanvasWidget widget) {
    if (_textStretchWidgetId == widget.id) return;
    _saveState();
    handleResizeStart(widget.id);
    setState(() {
      _textStretchWidgetId = widget.id;
      _textStretchBaseFontSize = widget.fontSize;
      _textStretchVisualScale = 1.0;
    });
  }

  void _handleTextStretchUpdate(
    CanvasWidget widget,
    DragUpdateDetails details,
  ) {
    setState(() {
      // Drag out (down-right, away from text) enlarges; drag in (up-left) shrinks.
      final double dragDelta = (details.delta.dx + details.delta.dy) / 2;
      final double sensitivity = max(_textStretchBaseFontSize * 0.12, 6.0);
      _textStretchVisualScale =
          (_textStretchVisualScale + dragDelta / sensitivity).clamp(0.25, 4.0);
    });
  }

  void _handleTextStretchEnd(CanvasWidget widget) {
    setState(() {
      final double newFontSize =
          (_textStretchBaseFontSize * _textStretchVisualScale).clamp(
            _kTextFontSizeMin,
            _textFontSizeMax(widget),
          );
      _applyTextFontSize(widget, newFontSize);
      _textStretchWidgetId = null;
      _textStretchVisualScale = 1.0;
    });
    handleResizeEnd();
  }

  /// Bottom-right stretch handle: white circle + [assets/stretch.png].
  Widget _buildStretchCornerHandle({
    required CanvasWidget widget,
    required double circleSize,
    required double hitExtent,
  }) {
    final double iconInset = circleSize * 0.22;
    return GestureDetector(
      onTapDown: (_) => _handleTextStretchStart(widget),
      onPanStart: (_) => _handleTextStretchStart(widget),
      onPanUpdate: (details) => _handleTextStretchUpdate(widget, details),
      onPanEnd: (_) => _handleTextStretchEnd(widget),
      onPanCancel: () {
        if (_textStretchWidgetId == widget.id) {
          _handleTextStretchEnd(widget);
        }
      },
      behavior: HitTestBehavior.translucent,
        child: SizedBox(
        width: hitExtent,
        height: hitExtent,
        child: Center(
          child: Container(
            width: circleSize,
            height: circleSize,
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.18),
                  blurRadius: circleSize * 0.15,
                  offset: Offset(0, circleSize * 0.06),
                ),
              ],
            ),
            child: Padding(
              padding: EdgeInsets.all(iconInset),
              child: Image.asset(
                'assets/stretch.png',
                fit: BoxFit.contain,
              ),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _buildTextSelectionOverlay(CanvasWidget widget) {
    return [];
  }

  static const Color _selectedReplaceableImageOverlay =
      Color(0x4D000000); // black @ 30% opacity

  List<Widget> _buildResizeOverlay(
    CanvasWidget widget, {
    bool isTextLayer = false,
  }) {
    if (_isUntouchableBackgroundLayer(widget)) return [];
    if (widget.id != _selectedWidgetId || !widget.isEditable) return [];

    if (isTextLayer) {
      return _buildTextSelectionOverlay(widget);
    }

    final ({Size size, Offset offset}) bounds =
        _imageContentSelectionBounds(widget);
    final double w = bounds.size.width;
    final double h = bounds.size.height;
    final double ox = bounds.offset.dx;
    final double oy = bounds.offset.dy;

    const double rotationHit = 160.0;
    const double rotationVisual = 44.0;
    const double rotationIcon = 24.0;
    const double rotationTop = -140.0;
    const double markLineWidth = 1.0;

    return [
      Positioned(
        top: oy,
        left: ox,
        width: w,
        height: h,
        child: IgnorePointer(
          child: Container(
            decoration: BoxDecoration(
              border: Border.all(color: Colors.blue, width: markLineWidth),
              color: _selectedReplaceableImageOverlay,
            ),
          ),
        ),
      ),

      // Image size changes require a two-finger pinch on the canvas (not handles).
      // Rotation handle
      Positioned(
        top: oy + rotationTop,
        left: ox + w / 2 - rotationHit / 2,
        child: RotationHandle(
          widget: widget,
          rotation: (_isRotating && widget.id == _selectedWidgetId)
              ? _currentRotation
              : widget.rotation,
          onDragStart: (details) => _handleRotationStart(widget, details),
          onDragUpdate: (details) => _handleRotationUpdate(widget, details),
          onDragEnd: (details) => _handleRotationEnd(widget),
          hitExtent: rotationHit,
          visualSize: rotationVisual,
          iconSize: rotationIcon,
        ),
      ),
    ];
  }

  Widget _buildSelectionHandle({double size = 30}) {
    final double borderWidth = (size * 0.12).clamp(1.0, 2.5);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Colors.blue,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: borderWidth),
        boxShadow: [
          BoxShadow(
            color: Colors.black26,
            blurRadius: size * 0.2,
            offset: Offset(0, size * 0.07),
          ),
        ],
      ),
    );
  }

  Widget _buildFooterSelectionHandle() {
    return IgnorePointer(
      child: Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          border: Border.all(
            color: const Color(0xFF3B82F6),
            width: 1.5,
          ),
        ),
      ),
    );
  }

  void _moveSelectedWidget(
    double dx,
    double dy, {
    String? widgetId,
  }) {
    final String? targetId = widgetId ?? _selectedWidgetId;
    if (targetId == null) return;
    setState(() {
      final int index =
          _canvasWidgets.indexWhere((CanvasWidget w) => w.id == targetId);
      if (index == -1) return;

      final CanvasWidget target = _canvasWidgets[index];
      target.position = Offset(
        target.position.dx + dx,
        target.position.dy + dy,
      );

      if (target.frameId != null) {
        for (final CanvasWidget other in _canvasWidgets) {
          if (other.id != target.id && other.frameId == target.frameId) {
            other.position = Offset(
              other.position.dx + dx,
              other.position.dy + dy,
            );
          }
        }
      }

      _clampWidgetInCanvas(target);
    });
  }

  Widget _buildNudgeArrowButton({
    required IconData icon,
    required VoidCallback onTap,
    required double width,
    required double height,
    double iconSize = 38,
  }) {
    final double hitSize = min(width, height);
    final double resolvedIconSize = min(iconSize, hitSize * 0.82);

    return SizedBox(
      width: width,
      height: height,
      child: Material(
        color: Colors.transparent,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          customBorder: const CircleBorder(),
          splashColor: Colors.black12,
          highlightColor: Colors.black.withOpacity(0.06),
          child: Center(
            child: Icon(
              icon,
              size: resolvedIconSize,
              weight: 700,
              fill: 1,
                    color: Colors.black87,
                  ),
                ),
              ),
      ),
    );
  }

  Widget _buildNudgeControl({String? targetWidgetId, double size = 80}) {
    final double outerSize = size;
    final double arrowHit = outerSize * 0.42;
    final double edgeInset = max(2.0, outerSize * 0.03);
    final double iconSize = arrowHit * 0.82;
    final double arrowOffset = (outerSize - arrowHit) / 2;

    return SizedBox(
      width: outerSize,
      height: outerSize,
      child: Stack(
        clipBehavior: Clip.none,
            children: [
          Positioned(
            top: edgeInset,
            left: arrowOffset,
            child: _buildNudgeArrowButton(
              icon: Icons.keyboard_arrow_up_rounded,
              width: arrowHit,
              height: arrowHit,
              iconSize: iconSize,
              onTap: () => _moveSelectedWidget(0, -5, widgetId: targetWidgetId),
            ),
          ),
          Positioned(
            bottom: edgeInset,
            left: arrowOffset,
            child: _buildNudgeArrowButton(
              icon: Icons.keyboard_arrow_down_rounded,
              width: arrowHit,
              height: arrowHit,
              iconSize: iconSize,
              onTap: () => _moveSelectedWidget(0, 5, widgetId: targetWidgetId),
            ),
          ),
          Positioned(
            left: edgeInset,
            top: arrowOffset,
            child: _buildNudgeArrowButton(
              icon: Icons.keyboard_arrow_left_rounded,
              width: arrowHit,
              height: arrowHit,
              iconSize: iconSize,
              onTap: () => _moveSelectedWidget(-5, 0, widgetId: targetWidgetId),
            ),
          ),
          Positioned(
            right: edgeInset,
            top: arrowOffset,
            child: _buildNudgeArrowButton(
              icon: Icons.keyboard_arrow_right_rounded,
              width: arrowHit,
              height: arrowHit,
              iconSize: iconSize,
              onTap: () => _moveSelectedWidget(5, 0, widgetId: targetWidgetId),
            ),
          ),
        ],
      ),
    );
  }

  static const double _kTextFontSizeMin = 5.0;
  static const double _kTextFontSizeStep = 1.0;

  double _textFontSizeMax(CanvasWidget widget) {
    return max(
      100.0,
      (widget.fontSize * 2.5).clamp(100.0, 1000.0),
    ).toDouble();
  }

  String _formatTextFontSizeLabel(double fontSize) {
    return fontSize.toStringAsFixed(fontSize % 1 == 0 ? 0 : 1);
  }

  String _formatSpacingValueLabel(double value) {
    return value.toStringAsFixed(value % 1 == 0 ? 0 : 1);
  }

  void _applyLineHeightChange(
    CanvasWidget widget,
    double value,
    StateSetter setModalState,
  ) {
    setModalState(() {
      if (!mounted) return;
                              setState(() {
        widget.lineHeight = value.clamp(0.8, 3.0);
        widget.lineHeightCustomized = true;
        _ensureTextBoxFitsWrappedContent(widget);
      });
      _notifyTextEditSheet();
    });
  }

  Widget _buildFontSizeValueLabel(String label, {double width = 28}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: SizedBox(
        width: width,
        height: 28,
        child: Center(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              label,
              maxLines: 1,
              softWrap: false,
              textAlign: TextAlign.center,
                    style: TextStyle(
                      fontFamily: 'Outfit',
                fontSize: 16,
                fontWeight: FontWeight.w600,
                height: 1,
                color: Colors.grey[800],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _applyTextFontSize(CanvasWidget widget, double value) {
    final double newSize = value.clamp(_kTextFontSizeMin, _textFontSizeMax(widget));
                                final double oldWidth = widget.boxWidth ?? 0.0;
    final double oldHeight = widget.boxHeight ?? 0.0;
                                final Offset oldCenter = Offset(
                                  widget.position.dx + (oldWidth / 2),
                                  widget.position.dy + (oldHeight / 2),
                                );
    final double oldFontSize =
        widget.fontSize <= 0 ? newSize : widget.fontSize;
    final double scaleRatio =
        oldFontSize == 0 ? 1.0 : (newSize / oldFontSize);
    widget.fontSize = newSize;
                                widget.isAutoFitText = false;
                                if (widget.boxWidth != null) {
      widget.boxWidth = (widget.boxWidth! * scaleRatio)
                                          .clamp(1.0, _canvasSize.width)
                                          .toDouble();
                                }
                                if (widget.boxHeight != null) {
      widget.boxHeight = (widget.boxHeight! * scaleRatio)
                                          .clamp(1.0, _canvasSize.height)
                                          .toDouble();
                                }
    _ensureTextBoxFitsWrappedContent(widget);
    if (widget.boxWidth != null && widget.boxHeight != null) {
                                  widget.position = Offset(
                                    oldCenter.dx - (widget.boxWidth! / 2),
                                    oldCenter.dy - (widget.boxHeight! / 2),
                                  );
                                  _clampWidgetInCanvas(widget);
                                }
  }

  void _nudgeTextFontSize(
    CanvasWidget widget,
    double delta,
    StateSetter setModalState,
  ) {
    setModalState(() {
      setState(() {
        _applyTextFontSize(widget, widget.fontSize + delta);
                              });
                            });
  }

  Widget _buildFontSizeCircleButton({
    required String symbol,
    required bool enabled,
    required VoidCallback? onPressed,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onPressed,
        customBorder: const CircleBorder(),
        child: Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(
              color: enabled ? Colors.grey[400]! : Colors.grey[300]!,
            ),
          ),
          alignment: Alignment.center,
          child: Text(
            symbol,
                        style: TextStyle(
                          fontFamily: 'Outfit',
              fontSize: 18,
              fontWeight: FontWeight.bold,
              height: 1,
              color: enabled ? Colors.black87 : Colors.grey[400],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTextSheetEditStyleRow(
    CanvasWidget widget,
    StateSetter setModalState,
  ) {
    final double maxSize = _textFontSizeMax(widget);
    final bool atMin = widget.fontSize <= _kTextFontSizeMin;
    final bool atMax = widget.fontSize >= maxSize;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Expanded(
            flex: 3,
            child: _buildTextSheetActionCell(
              'Edit',
                          () => _showEditDialog(widget, setModalState),
              compact: true,
                        ),
                      ),
          const SizedBox(width: 4),
                      Expanded(
            flex: 4,
            child: _buildTextSheetActionCell(
              'Add Text',
              () {
                Navigator.pop(context);
                _showAddTextBottomSheet();
              },
              compact: true,
            ),
          ),
          const SizedBox(width: 8),
          _buildFontSizeCircleButton(
            symbol: '−',
            enabled: !atMin,
            onPressed: atMin
                ? null
                : () => _nudgeTextFontSize(
                            widget,
                      -_kTextFontSizeStep,
                            setModalState,
                          ),
                        ),
          _buildFontSizeValueLabel(
            _formatTextFontSizeLabel(widget.fontSize),
          ),
          _buildFontSizeCircleButton(
            symbol: '+',
            enabled: !atMax,
            onPressed: atMax
                ? null
                : () => _nudgeTextFontSize(
                      widget,
                      _kTextFontSizeStep,
                      setModalState,
                    ),
          ),
        ],
    );
  }

  Future<void> _showTextEditingBottomSheet(CanvasWidget widget) async {
    if (_isUntouchableBackgroundLayer(widget)) return;
    await _dismissActiveBottomSheets();
    if (!mounted) return;
    _syncDefaultLineHeight(widget);
    setState(() {
      _selectedWidgetId = widget.id;
      _isEditingBottomSheetOpen = true;
    });

    final PersistentBottomSheetController? sheetController =
        _scaffoldKey.currentState?.showBottomSheet(
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            _textEditSheetSetState = setModalState;
            return Container(
              color: Colors.white,
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  SizedBox(
                    height: 36,
                    child: Row(
                      children: [
                        IconButton(
                          visualDensity: VisualDensity.compact,
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(
                            minWidth: 36,
                            minHeight: 36,
                          ),
                          icon: const Icon(Icons.close, size: 22),
                          onPressed: () => Navigator.pop(context),
                        ),
                        const Spacer(),
                        IconButton(
                          visualDensity: VisualDensity.compact,
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(
                            minWidth: 36,
                            minHeight: 36,
                          ),
                          icon: const Icon(Icons.delete_outline, size: 22),
                          onPressed: () {
                            if (widget.isFromFrame) {
                              _deleteEntireFooter();
                            } else {
                            setState(() {
                                _canvasWidgets.removeWhere(
                                  (w) => w.id == widget.id,
                                );
                                _selectedWidgetId = null;
                              });
                            }
                            Navigator.pop(context);
                          },
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 7,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            _buildTextSheetEditStyleRow(widget, setModalState),
                              _buildTextSheetFourItemRow([
                                  _buildTextSheetActionCell(
                                    'Style',
                                    () => _showFontSelectionBottomSheet(widget),
                                    compact: true,
                                  ),
                                  Center(
                                    child: _buildFormatToggle(
                        icon: Icons.format_italic,
                        isActive: widget.fontStyle == FontStyle.italic,
                        onTap: () {
                          setModalState(() {
                            setState(() {
                              widget.fontStyle =
                                  widget.fontStyle == FontStyle.italic
                                  ? FontStyle.normal
                                  : FontStyle.italic;
                            });
                          });
                        },
                      ),
                                  ),
                                  Center(
                                    child: _buildFormatToggle(
                        icon: Icons.format_underlined,
                        isActive: widget.decoration == TextDecoration.underline,
                        onTap: () {
                          setModalState(() {
                            setState(() {
                              widget.decoration =
                                                widget.decoration ==
                                                    TextDecoration.underline
                                  ? TextDecoration.none
                                  : TextDecoration.underline;
                            });
                          });
                        },
                      ),
                                  ),
                                  Center(
                                    child: _buildBottomTool(
                                      icon: Icons.color_lens_outlined,
                                      isActive: false,
                                      onTap: () => _showColorPickerBottomSheet(
                          widget,
                                      ),
                                    ),
                                  ),
                                ]),
                                _buildTextSheetFourItemRow([
                                  Center(
                                    child: _buildBottomTool(
                        text: "AA",
                        isActive: widget.isUpperCase,
                        onTap: () {
                          setModalState(() {
                            setState(() {
                              widget.isUpperCase = !widget.isUpperCase;
                            });
                          });
                        },
                      ),
                                  ),
                                  Center(
                                    child: _buildFormatToggle(
                                      icon: _textAlignIcon(widget.textAlign),
                        isActive: false,
                                      onTap: () => _showTextAlignmentBottomSheet(
                                        widget,
                                      ),
                                    ),
                                  ),
                                  Center(
                                    child: _buildBottomTool(
                                      icon: Icons.format_line_spacing,
                        isActive: false,
                                      onTap: () => _showSpacingBottomSheet(
                                        widget,
                                      ),
                                    ),
                                  ),
                                  Center(
                                    child: _buildFormatToggle(
                                      icon: Icons.format_bold,
                                      isActive: widget.fontWeight == FontWeight.bold,
                        onTap: () {
                                        setModalState(() {
                                          setState(() {
                                            widget.fontWeight =
                                                widget.fontWeight == FontWeight.bold
                                                ? FontWeight.normal
                                                : FontWeight.bold;
                                          });
                                        });
                                      },
                                    ),
                                  ),
                              ]),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        flex: 3,
                        child: LayoutBuilder(
                          builder: (context, constraints) {
                            final double nudgeSize = min(
                              constraints.maxWidth - 4,
                              108.0,
                            );
                            return Container(
                              alignment: Alignment.center,
                              constraints: BoxConstraints(minHeight: nudgeSize),
                              decoration: BoxDecoration(
                                border: Border(
                                  left: BorderSide(color: Colors.grey[300]!),
                                ),
                              ),
                              child: _buildNudgeControl(
                                targetWidgetId: widget.id,
                                size: nudgeSize,
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: MediaQuery.paddingOf(context).bottom),
                ],
              ),
            );
          },
        );
      },
    );

    _activePersistentBottomSheetController = sheetController;
    sheetController?.closed.whenComplete(() {
      if (!mounted) return;
      _textEditSheetSetState = null;
      setState(() {
        if (identical(_activePersistentBottomSheetController, sheetController)) {
          _activePersistentBottomSheetController = null;
        }
        _isEditingBottomSheetOpen = false;
        if (_selectedWidgetId == widget.id) {
          _selectedWidgetId = null;
        }
      });
    });
  }

  // --- Font Selection ---
  void _showFontSelectionBottomSheet(
    CanvasWidget widget,
  ) {
    final Future<void> remoteFontsFuture = _ensureRemoteFontsLoaded();
    final ScrollController languageScrollController = ScrollController();
    final ScrollController fontListScrollController = ScrollController();
    final TextEditingController fontSearchController = TextEditingController();
    String selectedLanguage = '';
    String searchQuery = '';

    _showManagedModalBottomSheet(
      context: context,
      dismissActiveSheets: false,
      isDismissible: true,
      enableDrag: true,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (modalContext, setModalState) {
            final double keyboardInset = MediaQuery.of(
              context,
            ).viewInsets.bottom;
            final double maxSheetHeight =
                MediaQuery.of(context).size.height * 0.82;
            final double sheetHeight = maxSheetHeight < 430
                ? maxSheetHeight
                : 430;
            return AnimatedPadding(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              padding: EdgeInsets.only(bottom: keyboardInset),
              child: SafeArea(
                top: false,
                child: Container(
                  padding: const EdgeInsets.all(20),
                  height: sheetHeight,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            "Select Font Style",
                            style: TextStyle(
                              fontFamily: 'Outfit',
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () => Navigator.pop(context),
                          ),
                        ],
                      ),
                      const Divider(),
                      Expanded(
                        child: FutureBuilder<void>(
                          future: remoteFontsFuture,
                          builder: (context, snapshot) {
                            final List<FontCatalogItem> options = _remoteFontOptions;

                            final Set<String> languageSet = <String>{};
                            for (final option in options) {
                              final String rawLanguage = option.language.trim();
                              if (rawLanguage.isEmpty) continue;
                              final List<String> languages = rawLanguage
                                  .split(RegExp(r'[,/|]'))
                                  .map((e) => e.trim())
                                  .where((e) => e.isNotEmpty)
                                  .toList();
                              if (languages.isEmpty) {
                                if (rawLanguage.toLowerCase() != 'all') {
                                  languageSet.add(rawLanguage);
                                }
                              } else {
                                languageSet.addAll(
                                  languages.where(
                                    (e) => e.toLowerCase() != 'all',
                                  ),
                                );
                              }
                            }
                            final List<String> languageOptions = languageSet
                                .toList();
                            languageOptions.sort((a, b) {
                              return a.toLowerCase().compareTo(b.toLowerCase());
                            });
                            if (selectedLanguage.isEmpty &&
                                languageOptions.isNotEmpty) {
                              selectedLanguage = languageOptions.first;
                            } else if (selectedLanguage.isNotEmpty &&
                                !languageOptions.contains(selectedLanguage)) {
                              selectedLanguage = languageOptions.isEmpty
                                  ? ''
                                  : languageOptions.first;
                            }

                            bool matchesSelectedLanguage(
                              FontCatalogItem item,
                              String selected,
                            ) {
                              if (selected.isEmpty) return true;
                              final String raw = item.language.trim();
                              if (raw.isEmpty) return false;
                              final List<String> tokens = raw
                                  .split(RegExp(r'[,/|]'))
                                  .map((e) => e.trim().toLowerCase())
                                  .where((e) => e.isNotEmpty)
                                  .toList();
                              return tokens.contains(selected.toLowerCase()) ||
                                  raw.toLowerCase() == selected.toLowerCase();
                            }

                            bool matchesSearch(
                              FontCatalogItem item,
                              String query,
                            ) {
                              final String normalizedQuery = query
                                  .trim()
                                  .toLowerCase();
                              if (normalizedQuery.isEmpty) return true;
                              return item.displayName.toLowerCase().contains(
                                    normalizedQuery,
                                  ) ||
                                  item.family.toLowerCase().contains(
                                    normalizedQuery,
                                  ) ||
                                  item.postscriptName.toLowerCase().contains(
                                    normalizedQuery,
                                  );
                            }

                            final List<FontCatalogItem> filteredOptions =
                                options
                                    .where(
                                      (item) => matchesSelectedLanguage(
                                        item,
                                        selectedLanguage,
                                      ),
                                    )
                                    .where(
                                      (item) =>
                                          matchesSearch(item, searchQuery),
                                    )
                                    .toList();
                            final String currentFontFamily =
                                (widget.fontFamily?.trim().isNotEmpty ?? false)
                                ? widget.fontFamily!.trim()
                                : 'Outfit';
                            final String currentFontKey =
                                _normalizeFontLookupKey(currentFontFamily);
                            final String selectedTtfUrlKey = _normalizeUrlKey(
                              _extractPrimaryTtfUrl(widget.fontUrls),
                            );
                            bool matchesCurrentFont(FontCatalogItem item) {
                              final String optionUrlKey = _normalizeUrlKey(
                                item.url,
                              );
                              if (selectedTtfUrlKey.isNotEmpty &&
                                  optionUrlKey.isNotEmpty) {
                                return optionUrlKey == selectedTtfUrlKey;
                              }
                              final Set<String> optionKeys = <String>{
                                _normalizeFontLookupKey(item.flutterFamily),
                                _normalizeFontLookupKey(item.displayName),
                                _normalizeFontLookupKey(item.family),
                                _normalizeFontLookupKey(item.postscriptName),
                              }..removeWhere((e) => e.isEmpty);
                              return optionKeys.contains(currentFontKey);
                            }

                            FontCatalogItem? currentFontOption;
                            for (final option in options) {
                              if (matchesCurrentFont(option)) {
                                currentFontOption = option;
                                break;
                              }
                            }
                            if (currentFontOption == null &&
                                currentFontFamily.isNotEmpty) {
                              currentFontOption = FontCatalogItem(
                                displayName: currentFontFamily,
                                family: currentFontFamily,
                                postscriptName: currentFontFamily,
                                language: selectedLanguage.isEmpty
                                    ? 'All'
                                    : selectedLanguage,
                                url: _extractPrimaryTtfUrl(widget.fontUrls),
                              );
                            }
                            if (currentFontOption != null &&
                                !filteredOptions.any(
                                  (item) => matchesCurrentFont(item),
                                )) {
                              filteredOptions.insert(0, currentFontOption);
                            }
                            filteredOptions.sort((a, b) {
                              final bool aIsCurrent = matchesCurrentFont(a);
                              final bool bIsCurrent = matchesCurrentFont(b);
                              if (aIsCurrent == bIsCurrent) return 0;
                              return aIsCurrent ? -1 : 1;
                            });

                            return Column(
                              children: [
                                if (snapshot.connectionState ==
                                        ConnectionState.waiting &&
                                    _remoteFontOptions.isEmpty)
                                  const LinearProgressIndicator(minHeight: 2),
                                TextField(
                                  controller: fontSearchController,
                                  onChanged: (value) {
                                    setModalState(() {
                                      searchQuery = value;
                                    });
                                  },
                                  decoration: InputDecoration(
                                    hintText: 'Search font family',
                                    prefixIcon: const Icon(Icons.search),
                                    isDense: true,
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    contentPadding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 10,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 8),
                                SizedBox(
                                  height: 44,
                                  child: ListView.separated(
                                    controller: languageScrollController,
                                    scrollDirection: Axis.horizontal,
                                    itemCount: languageOptions.length,
                                    separatorBuilder: (_, __) =>
                                        const SizedBox(width: 8),
                                    itemBuilder: (context, index) {
                                      final String language =
                                          languageOptions[index];
                                      final bool isSelected =
                                          language == selectedLanguage;
                                      return ChoiceChip(
                                        label: Text(
                                          language,
                                          style: TextStyle(
                                            fontFamily: 'Outfit',
                                            fontSize: 11,
                                          ),
                                        ),
                                        selected: isSelected,
                                        materialTapTargetSize:
                                            MaterialTapTargetSize.shrinkWrap,
                                        visualDensity: VisualDensity.compact,
                                        labelPadding:
                                            const EdgeInsets.symmetric(
                                              horizontal: 6,
                                            ),
                                        onSelected: (_) {
                                          setModalState(() {
                                            selectedLanguage = language;
                                          });
                                        },
                                      );
                                    },
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Expanded(
                                  child: RawScrollbar(
                                    controller: fontListScrollController,
                                    thumbVisibility: true,
                                    interactive: true,
                                    thickness: 12,
                                    radius: const Radius.circular(10),
                                    child: ListView.builder(
                                      controller: fontListScrollController,
                                      itemCount: filteredOptions.length,
                                      itemBuilder: (context, index) {
                                        final option = filteredOptions[index];
                                        final String fontFamily =
                                            _preferredFontFamilyForCatalogItem(
                                              option,
                                            );
                                        final bool isSelected =
                                            matchesCurrentFont(option);

                                        if (option.url != null &&
                                            option.url!.isNotEmpty &&
                                            !_loadedFonts.contains(
                                              fontFamily,
                                            )) {
                                          unawaited(
                                            _loadRemoteFont(
                                              fontFamily,
                                              <String, dynamic>{
                                                'ttf': option.url,
                                              },
                                            ).then((_) {
                                              if (modalContext.mounted) {
                                                setModalState(() {});
                                              }
                                            }),
                                          );
                                        }

                                        return ListTile(
                                          title: Text(
                                            option.displayName,
                                            style: _getSafeTextStyle(
                                              fontFamily: fontFamily,
                                              fontSize: 15,
                                            ),
                                          ),
                                          trailing: isSelected
                                              ? const Icon(
                                                  Icons.check,
                                                  color: Colors.blue,
                                                )
                                              : null,
                                          onTap: () {
                                            if (!mounted) return;
                                              setState(() {
                                                widget.fontFamily = fontFamily;
                                                if (option.url != null &&
                                                    option.url!.isNotEmpty) {
                                                  widget.fontUrls =
                                                      <String, dynamic>{
                                                        'ttf': option.url,
                                                      };
                                                } else {
                                                  widget.fontUrls = null;
                                                }
                                              });
                                            _notifyTextEditSheet();
                                            if (option.url != null &&
                                                option.url!.isNotEmpty) {
                                              unawaited(
                                                _loadRemoteFont(
                                                  fontFamily,
                                                  <String, dynamic>{
                                                    'ttf': option.url,
                                                  },
                                                ),
                                              );
                                            }
                                            Navigator.pop(context);
                                          },
                                        );
                                      },
                                    ),
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  void _deleteEntireFooter() {
    _saveState();
    setState(() {
      _selectedFrame = 'none';
      _selectedFrameJson = null;
      _canvasWidgets.removeWhere((w) => w.isFromFrame);
      if (_selectedWidgetId != null &&
          _selectedWidgetId!.startsWith('footer_')) {
        _selectedWidgetId = null;
      }
    });
  }

  // --- Color Picker ---
  void _showColorPickerBottomSheet(
    CanvasWidget widget, {
    String pickerTitle = 'Font Color',
  }) {
    final List<Color> colors = [
      Colors.black,
      Colors.white,
      Colors.red,
      Colors.pink,
      Colors.purple,
      Colors.deepPurple,
      Colors.indigo,
      Colors.blue,
      Colors.lightBlue,
      Colors.cyan,
      Colors.teal,
      Colors.green,
      Colors.lightGreen,
      Colors.lime,
      Colors.yellow,
      Colors.amber,
      Colors.orange,
      Colors.deepOrange,
      Colors.brown,
      Colors.grey,
      Colors.blueGrey,
    ];

    _showManagedModalBottomSheet(
      context: context,
      dismissActiveSheets: false,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return Container(
          color: Colors.white,
          padding: const EdgeInsets.all(20),
          height: 350,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    pickerTitle,
                    style: TextStyle(
                      fontFamily: 'Outfit',
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Row(
                    children: [
                      if (widget.isFromFrame)
                        IconButton(
                          tooltip: 'Delete Footer',
                          icon: const Icon(
                            Icons.delete_forever,
                            color: Colors.red,
                          ),
                          onPressed: () {
                            _deleteEntireFooter();
                            Navigator.pop(context);
                          },
                        ),
                      if (!widget.isShapeRasterLayer)
                      IconButton(
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () {
                            _applyTextWidgetColor(widget, Colors.black);
                        },
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ],
                  ),
                ],
              ),
              const Divider(),
              Expanded(
                child: GridView.builder(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 6,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                  ),
                  itemCount: colors.length + 1, // Add 1 for the gradient button
                  itemBuilder: (context, index) {
                    if (index == 0) {
                      // Gradient Button (Navigate to Advanced Color Picker)
                      return GestureDetector(
                        onTap: () async {
                          final bool isFooterShapePicker =
                              widget.isShapeRasterLayer && widget.isFromFrame;
                          final Color initialPickerColor = isFooterShapePicker
                              ? await _resolveTemplateBackgroundDefaultColor()
                              : widget.color;
                          Navigator.pop(context); // Close current sheet
                          _showAdvancedColorPicker(
                            widget,
                            initialColor: initialPickerColor,
                          ); // Open Advanced Picker
                        },
                        child: Container(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: const SweepGradient(
                              colors: [
                                Colors.red,
                                Colors.orange,
                                Colors.yellow,
                                Colors.green,
                                Colors.blue,
                                Colors.indigo,
                                Colors.purple,
                                Colors.red,
                              ],
                            ),
                            border: Border.all(
                              color: Colors.grey[300]!,
                              width: 1,
                            ),
                          ),
                          child: const Icon(
                            Icons.add,
                            color: Colors.white,
                            size: 20,
                          ),
                        ),
                      );
                    }

                    final color = colors[index - 1];
                    final isSelected = widget.color.value == color.value;
                    return GestureDetector(
                      onTap: () {
                        _applyTextWidgetColor(widget, color);
                        Navigator.pop(context);
                      },
                      child: Container(
                        decoration: BoxDecoration(
                          color: color,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: Colors.grey[300]!,
                            width: 1,
                          ),
                        ),
                        child: isSelected
                            ? Icon(
                                Icons.check,
                                color: color.computeLuminance() > 0.5
                                    ? Colors.black
                                    : Colors.white,
                                size: 16,
                              )
                            : null,
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<Color> _resolveTemplateBackgroundDefaultColor() async {
    final Color? visibleCanvasTone = await _extractVisibleCanvasBackgroundTone();
    if (visibleCanvasTone != null) {
      return visibleCanvasTone;
    }

    if (_backgroundImagePath != null && _backgroundImagePath!.isNotEmpty) {
      final Color? sampled = await _extractDominantColorFromImagePath(
        _backgroundImagePath!,
      );
      if (sampled != null) {
        return sampled;
      }
    }

    if (_backgroundGradient != null) {
      final Gradient gradient = _backgroundGradient!;
      if (gradient.colors.isNotEmpty) {
        final Color first = gradient.colors.first;
        final Color last = gradient.colors.last;
        return Color.lerp(first, last, 0.5) ?? first;
      }
    }

    return _backgroundColor;
  }

  Future<Color?> _extractVisibleCanvasBackgroundTone() async {
    try {
      final RenderRepaintBoundary? boundary =
          _canvasKey.currentContext?.findRenderObject()
              as RenderRepaintBoundary?;
      if (boundary == null) return null;

      final ui.Image canvasImage = await boundary.toImage(pixelRatio: 1.0);
      final ByteData? byteData = await canvasImage.toByteData(
        format: ui.ImageByteFormat.png,
      );
      if (byteData == null) return null;

      final Uint8List pngBytes = byteData.buffer.asUint8List();
      final img.Image? decoded = img.decodeImage(pngBytes);
      if (decoded == null) return null;

      // Prefer top corners / top region because footer shapes and most text
      // are not dominant there in templates.
      final Color? topRegion = _sampleImageTopRegionColor(decoded);
      if (topRegion != null) return topRegion;

      return _sampleImageEdgeAverageColor(decoded);
    } catch (_) {
      return null;
    }
  }

  Future<Color?> _extractDominantColorFromImagePath(String imagePath) async {
    try {
      Uint8List bytes;
      if (imagePath.startsWith('http')) {
        final http.Response response = await http
            .get(Uri.parse(imagePath))
            .timeout(const Duration(seconds: 8));
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return null;
        }
        bytes = response.bodyBytes;
      } else {
        final File file = File(imagePath);
        if (!await file.exists()) return null;
        bytes = await file.readAsBytes();
      }

      final img.Image? decoded = img.decodeImage(bytes);
      if (decoded == null) return null;

      // Prefer edge sampling to avoid center text/logo bias and capture
      // template background tone more accurately.
      Color? edgeColor = _sampleImageEdgeAverageColor(decoded);
      edgeColor ??= _sampleImageAverageColor(decoded);
      return edgeColor;
    } catch (_) {
      return null;
    }
  }

  Color? _sampleImageEdgeAverageColor(img.Image decoded) {
    final int width = decoded.width;
    final int height = decoded.height;
    if (width <= 0 || height <= 0) return null;

    final int stepX = (width / 80).ceil().clamp(1, 20);
    final int stepY = (height / 80).ceil().clamp(1, 20);

    int red = 0;
    int green = 0;
    int blue = 0;
    int count = 0;

    void addPixel(img.Pixel pixel) {
      if (pixel.a < 25) return;
      red += pixel.r.toInt();
      green += pixel.g.toInt();
      blue += pixel.b.toInt();
      count++;
    }

    for (int x = 0; x < width; x += stepX) {
      addPixel(decoded.getPixel(x, 0));
      addPixel(decoded.getPixel(x, height - 1));
    }
    for (int y = 0; y < height; y += stepY) {
      addPixel(decoded.getPixel(0, y));
      addPixel(decoded.getPixel(width - 1, y));
    }

    if (count == 0) return null;
    return Color.fromARGB(
      255,
      (red / count).round().clamp(0, 255),
      (green / count).round().clamp(0, 255),
      (blue / count).round().clamp(0, 255),
    );
  }

  Color? _sampleImageTopRegionColor(img.Image decoded) {
    final int width = decoded.width;
    final int height = decoded.height;
    if (width <= 0 || height <= 0) return null;

    final int minX = (width * 0.05).round().clamp(0, width - 1);
    final int maxX = (width * 0.95).round().clamp(0, width - 1);
    final int minY = (height * 0.03).round().clamp(0, height - 1);
    final int maxY = (height * 0.28).round().clamp(0, height - 1);

    final int stepX = ((maxX - minX) / 40).ceil().clamp(1, 12);
    final int stepY = ((maxY - minY) / 30).ceil().clamp(1, 10);

    int red = 0;
    int green = 0;
    int blue = 0;
    int count = 0;

    for (int y = minY; y <= maxY; y += stepY) {
      for (int x = minX; x <= maxX; x += stepX) {
        // Skip middle band to reduce title/text influence.
        final double nx = x / width;
        if (nx > 0.35 && nx < 0.65) continue;

        final img.Pixel pixel = decoded.getPixel(x, y);
        if (pixel.a < 25) continue;

        // Ignore near-black text strokes from headers/icons.
        final int value = ((pixel.r + pixel.g + pixel.b) / 3).round();
        if (value < 30) continue;

        red += pixel.r.toInt();
        green += pixel.g.toInt();
        blue += pixel.b.toInt();
        count++;
      }
    }

    if (count == 0) return null;
    return Color.fromARGB(
      255,
      (red / count).round().clamp(0, 255),
      (green / count).round().clamp(0, 255),
      (blue / count).round().clamp(0, 255),
    );
  }

  Color? _sampleImageAverageColor(img.Image decoded) {
    final int sampleXStep = (decoded.width / 60).ceil().clamp(1, 24);
    final int sampleYStep = (decoded.height / 60).ceil().clamp(1, 24);

    int red = 0;
    int green = 0;
    int blue = 0;
    int count = 0;

    for (int y = 0; y < decoded.height; y += sampleYStep) {
      for (int x = 0; x < decoded.width; x += sampleXStep) {
        final img.Pixel pixel = decoded.getPixel(x, y);
        if (pixel.a < 25) continue;
        red += pixel.r.toInt();
        green += pixel.g.toInt();
        blue += pixel.b.toInt();
        count++;
      }
    }

    if (count == 0) return null;
    return Color.fromARGB(
      255,
      (red / count).round().clamp(0, 255),
      (green / count).round().clamp(0, 255),
      (blue / count).round().clamp(0, 255),
    );
  }

  Widget _buildUntouchableCanvasLayer(CanvasWidget widget) {
    return Positioned(
      key: ValueKey<String>('${widget.id}-c$_shapeColorRevision'),
      left: widget.position.dx,
      top: widget.position.dy,
      child: IgnorePointer(
        child: RepaintBoundary(
          child: Transform.scale(
            scale: widget.scale,
            child: Transform.rotate(
              angle: widget.rotation,
              child: Transform(
                transform: Matrix4.identity()
                  ..scale(
                    widget.flipHorizontal ? -1.0 : 1.0,
                    widget.flipVertical ? -1.0 : 1.0,
                  ),
                alignment: Alignment.center,
                child: Opacity(
                  opacity: _effectiveLayerOpacity(widget),
                  child: BlendModeLayer(
                    blendMode: _parseBlendMode(widget.blendModeName),
                    child: _buildCanvasWidget(widget),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildInteractiveCanvasLayer(
    CanvasWidget widget, {
    bool contentVisible = true,
  }) {
    if (_isUntouchableBackgroundLayer(widget)) {
      return _buildUntouchableCanvasLayer(widget);
    }

    double left = widget.position.dx;
    double top = widget.position.dy;

    final bool isFooterAddressLayer = widget.isFromFrame &&
        widget.type == CanvasWidgetType.text &&
        widget.role == FooterBusinessProfileBinder.addressFieldId;

    if (widget.isFromFrame &&
        widget.type == CanvasWidgetType.text &&
        !isFooterAddressLayer) {
      final String transformedText = _prepareTextForSafeWrapping(
        _applyTextTransform(
          widget.text ?? 'Text',
          widget.textTransform,
          widget.isUpperCase,
        ),
      );
      final Size currentSize = _measureRenderedTextSize(widget, transformedText);
      final double tightW = currentSize.width;
      
      final double fallbackW = widget.boxWidth ?? 0;
      if (fallbackW > 0 && tightW != fallbackW) {
        if (widget.textAlign == TextAlign.center) {
          left = left - (tightW - fallbackW) / 2;
        } else if (widget.textAlign == TextAlign.right || widget.textAlign == TextAlign.end) {
          left = left - (tightW - fallbackW);
        }
      }
    }

    return Positioned(
      key: ValueKey<String>('${widget.id}-c$_shapeColorRevision'),
      left: left,
      top: top,
      child: RepaintBoundary(
        child: _buildInteractiveLayerTransform(
          widget,
          includeResizeOverlay: widget.isEditable &&
              (widget.type == CanvasWidgetType.logo ||
                  widget.type == CanvasWidgetType.text),
          contentVisible: contentVisible,
        ),
      ),
    );
  }

  Widget _buildInteractiveLayerTransform(
    CanvasWidget widget, {
    required bool includeResizeOverlay,
    bool contentVisible = true,
  }) {
    final bool blockPointer =
        !widget.isEditable || !_canvasCubit.canReceiveLayerPointer(widget.id);

    return IgnorePointer(
      ignoring: blockPointer,
      child: TapRegion(
        onTapOutside: (_) {
          // Bottom sheets/modals sit outside layer TapRegions; ignore those taps
          // so in-sheet controls do not dismiss the sheet. Outside dismiss is
          // handled by canvas empty-space taps and modal barriers only.
          if (_hasOpenBottomSheet) {
            return;
          }
          if (_canvasCubit.isInteractionLocked) {
            return;
          }
          if (_selectedWidgetId == widget.id) {
            setState(() => _selectedWidgetId = null);
          }
        },
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: () {
            if (_canvasCubit.activeGestureHadMovement) return;
            _handleWidgetTap(widget);
          },
          onScaleStart: (details) {
            if (!_canvasCubit.canStartLayerGesture(widget)) return;
            _handleInteractiveLayerScaleStart(widget, details);
          },
          onScaleUpdate: (details) {
            if (_canvasCubit.state.interactionWidgetId != null &&
                _canvasCubit.state.interactionWidgetId != widget.id) {
              return;
            }
            _handleInteractiveLayerScaleUpdate(widget, details);
          },
          onScaleEnd: (_) {
            if (_canvasCubit.state.interactionWidgetId == widget.id) {
              _handleInteractiveLayerScaleEnd(widget);
            }
          },
          child: Transform.scale(
            scale: widget.scale,
            child: Transform.rotate(
              angle: (_isRotating && widget.id == _selectedWidgetId)
                  ? _currentRotation
                  : widget.rotation,
              child: Transform(
                transform: Matrix4.identity()
                  ..scale(
                    widget.flipHorizontal ? -1.0 : 1.0,
                    widget.flipVertical ? -1.0 : 1.0,
                  ),
                alignment: Alignment.center,
                child: Opacity(
                  opacity: _effectiveLayerOpacity(widget),
                  child: BlendModeLayer(
                    blendMode: _parseBlendMode(widget.blendModeName),
                    child: Container(
                      color: Colors.transparent,
                      child: _wrapLayerWithTextStretchTransform(
                        widget,
                        Stack(
                          clipBehavior: Clip.none,
                          children: <Widget>[
                            if (contentVisible)
                              _buildCanvasWidget(widget)
                            else
                              SizedBox(
                                width: widget.boxWidth,
                                height: widget.boxHeight,
                              ),
                            if (includeResizeOverlay)
                              ..._buildResizeOverlay(
                                widget,
                                isTextLayer:
                                    widget.type == CanvasWidgetType.text,
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildEyedropperPencilVisual() {
    const double iconSize = 56;
    return SizedBox(
      width: _colorPencilSize,
      height: _colorPencilSize,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.bottomRight,
        children: [
          const GradientIcon(
            Icons.colorize,
            size: iconSize,
            gradient: AppGradients.brandVerticalBottomToTop,
          ),
          Positioned(
            right: _colorPencilSize *
                    (1 - CanvasEyedropperSampler.tipHotspotFraction.dx) -
                4,
            bottom: _colorPencilSize *
                    (1 - CanvasEyedropperSampler.tipHotspotFraction.dy) -
                4,
            child: Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 1.5),
                color: Colors.black26,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _handleEyedropperPointer(PointerEvent event) {
    final RenderBox? canvasBox =
        _internalCanvasKey.currentContext?.findRenderObject() as RenderBox?;
    if (canvasBox == null || _canvasSize.width <= 0) return;

    final Offset tipCanvas = canvasBox.globalToLocal(event.position);
    final Offset clampedTip = Offset(
      tipCanvas.dx.clamp(0.0, _canvasSize.width),
      tipCanvas.dy.clamp(0.0, _canvasSize.height),
    );
    _lastEyedropperTipCanvas = clampedTip;
    setState(() {
      _colorPencilCanvasOffset = CanvasEyedropperSampler.widgetTopLeftFromTip(
        tipCanvasPosition: clampedTip,
        toolSize: _colorPencilSize,
      );
    });
    _scheduleLiveEyedropperSample(clampedTip);
  }

  void _scheduleLiveEyedropperSample(Offset tipCanvasPosition) {
    if (!_isColorPencilVisible || _colorPickerTargetWidgetId == null) {
      return;
    }

    final DateTime now = DateTime.now();
    if (_lastEyedropperSampleTime != null &&
        now.difference(_lastEyedropperSampleTime!) <
            _eyedropperSampleInterval) {
      return;
    }
    _lastEyedropperSampleTime = now;
    unawaited(
      _sampleEyedropperColorAtTip(
        tipCanvasPosition,
        animateOnApply: false,
      ),
    );
  }

  void _handleEyedropperPointerUp(PointerUpEvent event) {
    _handleEyedropperPointer(event);
    _finishEyedropperFromLastTip();
  }

  void _finishEyedropperFromLastTip() {
    final Offset? tip = _lastEyedropperTipCanvas;
    if (tip == null) return;
    unawaited(
      _sampleEyedropperColorAtTip(
        tip,
        animateOnApply: true,
      ),
    );
  }

  Future<void> _sampleEyedropperColorAtTip(
    Offset tipCanvasPosition, {
    required bool animateOnApply,
  }) async {
    if (!mounted || _colorPickerTargetWidgetId == null) return;
    if (_eyedropperSampleInFlight) return;

    _eyedropperSampleInFlight = true;
    try {
      final RenderRepaintBoundary? boundary =
          _templateSampleRepaintKey.currentContext?.findRenderObject()
              as RenderRepaintBoundary?;
      if (boundary == null) return;

      final Color? picked = await CanvasEyedropperSampler.sampleAtTip(
        boundary: boundary,
        canvasLogicalSize: _canvasSize,
        tipCanvasPosition: tipCanvasPosition,
      );
      if (!mounted || picked == null) return;
      _applyFooterEyedropperColor(picked, animate: animateOnApply);
    } catch (e, st) {
      debugPrint('Eyedropper sample failed: $e\n$st');
    } finally {
      _eyedropperSampleInFlight = false;
    }
  }

  void _toggleColorPencil() {
    if (_isColorPencilVisible) {
      setState(() {
        _isColorPencilVisible = false;
        _lastEyedropperTipCanvas = null;
        _lastEyedropperSampleTime = null;
      });
      return;
    }
    final Offset initialTip = Offset(
      _canvasSize.width > 0 ? _canvasSize.width * 0.5 : 120,
      _canvasSize.height > 0 ? _canvasSize.height * 0.08 : 48,
    );
    setState(() {
      _isColorPickerSheetOpen = true;
      _isColorPencilVisible = true;
      _lastEyedropperTipCanvas = initialTip;
      _lastEyedropperSampleTime = null;
      _colorPencilCanvasOffset = CanvasEyedropperSampler.widgetTopLeftFromTip(
        tipCanvasPosition: initialTip,
        toolSize: _colorPencilSize,
      );
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_isColorPencilVisible) return;
      unawaited(
        _sampleEyedropperColorAtTip(
          initialTip,
          animateOnApply: false,
        ),
      );
    });
  }

  void _hideColorPencil() {
    if (!_isColorPencilVisible) return;
    setState(() {
      _isColorPencilVisible = false;
      _lastEyedropperTipCanvas = null;
      _lastEyedropperSampleTime = null;
    });
  }

  void _applyFooterEyedropperColor(Color picked, {required bool animate}) {
    final String? targetId = _colorPickerTargetWidgetId;
    if (targetId == null) return;

    final int targetIndex =
        _canvasWidgets.indexWhere((CanvasWidget w) => w.id == targetId);
    if (targetIndex < 0) return;

    final CanvasWidget current = _canvasWidgets[targetIndex];
    final Color resolved = _normalizeFooterTintColor(picked);
    final Color fromColor = _normalizeFooterTintColor(current.color);
    final String? frameId = current.frameId;

    if (!animate && resolved.value == fromColor.value) {
      _livePickerColor.value = resolved;
      return;
    }

    setState(() {
      _shapeColorRevision++;
      for (int i = 0; i < _canvasWidgets.length; i++) {
        final CanvasWidget w = _canvasWidgets[i];
        if (!w.isShapeRasterLayer || !w.isFromFrame) continue;
        if (frameId != null &&
            w.frameId != null &&
            w.frameId != frameId) {
          continue;
        }
        _canvasWidgets[i] = w.copy(color: resolved);
      }
      if (animate && fromColor != resolved) {
        _activeShapeTintAnimation = _ShapeTintAnimation(
          widgetId: current.id,
          from: fromColor,
          to: resolved,
        );
      } else {
        _activeShapeTintAnimation = null;
      }
    });

    _livePickerColor.value = resolved;
  }

  void _showAdvancedColorPicker(
    CanvasWidget widget, {
    Color? initialColor,
  }) {
    final bool isTextColorPicker = widget.type == CanvasWidgetType.text;

    if (isTextColorPicker) {
      _livePickerColor.value = initialColor ?? widget.color;
      _showManagedModalBottomSheet(
      context: context,
        dismissActiveSheets: false,
        isScrollControlled: true,
      backgroundColor: Colors.white,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (sheetContext) {
          final double maxHeight =
              MediaQuery.of(sheetContext).size.height * 0.42;
        return ColoredBox(
          color: Colors.white,
          child: ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            child: SafeArea(
              top: false,
              child: ConstrainedBox(
                constraints: BoxConstraints(maxHeight: maxHeight),
                child: AdvancedColorPicker(
                  currentColor: initialColor ?? widget.color,
                  liveExternalColor: _livePickerColor,
                  onColorChanged: (Color newColor) {
                    _applyTextWidgetColor(widget, newColor);
                  },
                  isColorPencilActive: false,
                  onColorPencilPressed: () {},
                  onColorPicked: null,
                ),
              ),
            ),
          ),
        );
        },
      );
      return;
    }

    _livePickerColor.value =
        _normalizeFooterTintColor(initialColor ?? widget.color);
    _colorPickerTargetWidgetId = widget.id;
    _colorPickerParentSetState = null;
    _onColorPicked = null;
    _isColorPickerSheetOpen = true;

    final ScaffoldState? scaffoldState = _scaffoldKey.currentState;
    if (scaffoldState == null) return;

    _safeCloseBottomSheetController();
    _activePersistentBottomSheetController = scaffoldState.showBottomSheet(
      (BuildContext sheetContext) {
        final double maxHeight =
            MediaQuery.of(sheetContext).size.height * 0.42;
        return ColoredBox(
          color: Colors.white,
          child: ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            child: SafeArea(
              top: false,
              child: ConstrainedBox(
                constraints: BoxConstraints(maxHeight: maxHeight),
                child: AdvancedColorPicker(
                  currentColor: initialColor ?? widget.color,
                  liveExternalColor: _livePickerColor,
                  onColorChanged: (Color newColor) {
                    final String? frameId = widget.frameId;
                    setState(() {
                      _shapeColorRevision++;
                      if (widget.isFromFrame && widget.isShapeRasterLayer) {
                        for (int i = 0; i < _canvasWidgets.length; i++) {
                          final CanvasWidget w = _canvasWidgets[i];
                          if (!w.isShapeRasterLayer || !w.isFromFrame) continue;
                          if (frameId != null &&
                              w.frameId != null &&
                              w.frameId != frameId) {
                            continue;
                          }
                          _canvasWidgets[i] = w.copy(color: newColor);
                        }
                      } else {
                        final int idx =
                            _canvasWidgets.indexWhere((w) => w.id == widget.id);
                        if (idx >= 0) {
                          _canvasWidgets[idx] =
                              _canvasWidgets[idx].copy(color: newColor);
                        }
                      }
                    });
                  },
                  isColorPencilActive: _isColorPencilVisible,
                  onColorPencilPressed: _toggleColorPencil,
                  onColorPencilDoubleTap: _hideColorPencil,
                  onDeletePressed: widget.isFromFrame
                      ? () {
                          _deleteEntireFooter();
                          _safeCloseBottomSheetController();
                        }
                      : null,
                  onColorPicked: _onColorPicked,
                ),
              ),
            ),
          ),
        );
      },
      backgroundColor: Colors.white,
      enableDrag: true,
    );

    _activePersistentBottomSheetController!.closed.whenComplete(() {
      if (!mounted) return;
      setState(() {
        _isColorPickerSheetOpen = false;
        _colorPickerTargetWidgetId = null;
        _colorPickerParentSetState = null;
        _onColorPicked = null;
        _activePersistentBottomSheetController = null;
        _selectedWidgetId = null;
      });
      _hideColorPencil();
    });
  }

  // --- Spacing & Flip ---
  void _showSpacingBottomSheet(
    CanvasWidget widget,
  ) {
    _syncDefaultLineHeight(widget);
    if (!widget.lineHeightCustomized && mounted) {
      setState(() {});
    }
    _showManagedModalBottomSheet(
      context: context,
      dismissActiveSheets: false,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setLimitState) {
            _syncDefaultLineHeight(widget);
            final double lineHeightSliderValue =
                widget.lineHeight.clamp(0.8, 3.0);
            return Container(
              color: Colors.white,
              padding: const EdgeInsets.all(20),
              height: 350,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        "Line Height and letter Spacing",
                        style: TextStyle(
                          fontFamily: 'Outfit',
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ],
                  ),
                  const Divider(),
                  const SizedBox(height: 10),
                  // Line Height
                  Row(
                    children: [
                      const Icon(Icons.format_line_spacing, size: 20),
                      const SizedBox(width: 8),
                      Text(
                        "Line Height",
                        style: TextStyle(fontFamily: 'Outfit'),
                      ),
                      const Spacer(),
                      Text(
                        '${_formatSpacingValueLabel(lineHeightSliderValue)}×',
                        style: TextStyle(
                          fontFamily: 'Outfit',
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: Colors.grey[800],
                        ),
                      ),
                    ],
                  ),
                  Slider(
                    value: lineHeightSliderValue,
                    min: 0.8,
                    max: 3.0,
                    activeColor: Colors.blue,
                    thumbColor: Colors.blue,
                    onChanged: (value) =>
                        _applyLineHeightChange(widget, value, setLimitState),
                  ),
                  // Letter Spacing
                  Row(
                    children: [
                      const Icon(Icons.text_fields, size: 20),
                      const SizedBox(width: 8),
                      Text(
                        "Letter Spacing",
                        style: TextStyle(fontFamily: 'Outfit'),
                      ),
                      const Spacer(),
                      Text(
                        _formatSpacingValueLabel(widget.letterSpacing),
                        style: TextStyle(
                          fontFamily: 'Outfit',
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: Colors.grey[800],
                        ),
                      ),
                    ],
                  ),
                  Slider(
                    value: widget.letterSpacing.clamp(-2.0, 10.0),
                    min: -2.0,
                    max: 10.0,
                    activeColor: Colors.blue,
                    thumbColor: Colors.blue,
                    onChanged: (value) {
                      setLimitState(() {
                        if (!mounted) return;
                          setState(() {
                            widget.letterSpacing = value;
                          _ensureTextBoxFitsWrappedContent(widget);
                          });
                        _notifyTextEditSheet();
                      });
                    },
                  ),
                  const SizedBox(height: 16),

                  // Flip Options (Also present here per user request)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _buildFlipButton(
                        "Flip Horizontal",
                        Icons.flip,
                        widget.flipHorizontal,
                        () {
                          setLimitState(() {
                            if (!mounted) return;
                              setState(() {
                                widget.flipHorizontal = !widget.flipHorizontal;
                              });
                            _notifyTextEditSheet();
                          });
                        },
                      ),
                      _buildFlipButton(
                        "Flip Vertical",
                        Icons.flip_camera_android,
                        widget.flipVertical,
                        () {
                          setLimitState(() {
                            if (!mounted) return;
                              setState(() {
                                widget.flipVertical = !widget.flipVertical;
                              });
                            _notifyTextEditSheet();
                          });
                        },
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildFlipButton(
    String label,
    IconData icon,
    bool isActive,
    VoidCallback onTap,
  ) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isActive ? Colors.blue[50] : Colors.grey[100],
          borderRadius: BorderRadius.circular(8),
          border: isActive ? Border.all(color: Colors.blue) : null,
        ),
        child: Row(
          children: [
            Icon(icon, color: isActive ? Colors.blue : Colors.black87),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                fontFamily: 'Outfit',
                color: isActive ? Colors.blue : Colors.black87,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _updateTextAlign(
    CanvasWidget widget,
    TextAlign align,
  ) {
    if (!mounted) return;
      setState(() {
        widget.textAlign = align;
      });
    _notifyTextEditSheet();
  }

  IconData _textAlignIcon(TextAlign align) {
    switch (align) {
      case TextAlign.center:
        return Icons.format_align_center;
      case TextAlign.right:
        return Icons.format_align_right;
      case TextAlign.left:
      default:
        return Icons.format_align_left;
    }
  }

  void _showTextAlignmentBottomSheet(
    CanvasWidget widget,
  ) {
    _showManagedModalBottomSheet(
      context: context,
      dismissActiveSheets: false,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) {
        return SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Alignment',
                      style: TextStyle(
                        fontFamily: 'Outfit',
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: Colors.grey[800],
                      ),
                    ),
                    IconButton(
                      visualDensity: VisualDensity.compact,
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(
                        minWidth: 32,
                        minHeight: 32,
                      ),
                      icon: const Icon(Icons.close, size: 20),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                _buildTextAlignmentOption(
                  label: 'Left align',
                  icon: Icons.format_align_left,
                  isActive: widget.textAlign == TextAlign.left,
                  onTap: () {
                    _updateTextAlign(widget, TextAlign.left);
                    Navigator.pop(context);
                  },
                ),
                _buildTextAlignmentOption(
                  label: 'Center align',
                  icon: Icons.format_align_center,
                  isActive: widget.textAlign == TextAlign.center,
                  onTap: () {
                    _updateTextAlign(widget, TextAlign.center);
                    Navigator.pop(context);
                  },
                ),
                _buildTextAlignmentOption(
                  label: 'Right align',
                  icon: Icons.format_align_right,
                  isActive: widget.textAlign == TextAlign.right,
                  onTap: () {
                    _updateTextAlign(widget, TextAlign.right);
                    Navigator.pop(context);
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildTextAlignmentOption({
    required String label,
    required IconData icon,
    required bool isActive,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: isActive ? Colors.blue.withOpacity(0.08) : Colors.grey[50],
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: isActive ? Colors.blue : Colors.grey[300]!,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  icon,
                  size: 22,
                  color: isActive ? Colors.blue : Colors.black87,
                ),
                const SizedBox(width: 12),
                Text(
                  label,
                  style: TextStyle(
                    fontFamily: 'Outfit',
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: isActive ? Colors.blue : Colors.black87,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showEditDialog(CanvasWidget widget, StateSetter setModalState) {
    TextEditingController controller = TextEditingController(
      text: widget.text ?? 'Text',
    );
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Edit Text"),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(border: OutlineInputBorder()),
          maxLines: 3,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text("Cancel"),
          ),
          ElevatedButton(
            onPressed: () {
              if (!mounted) return;
                setState(() {
                  widget.text = controller.text;
                _resizeTextBoxToFitContent(widget);
                });
              _notifyTextEditSheet();
              Navigator.pop(context);
            },
            child: const Text("Save"),
          ),
        ],
      ),
    );
  }

  void _duplicateWidget(CanvasWidget original) {
    setState(() {
      final newWidget = original.copy(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        position: original.position + const Offset(20, 20),
        zIndex: _nextZIndex,
      );
      _canvasWidgets.add(newWidget);
      _selectedWidgetId = newWidget.id;
    });
  }

  Widget _buildActionRowItem(String label, IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.grey[100],
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              label,
              style: TextStyle(
                fontFamily: 'Outfit',
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
            Icon(icon, size: 14, color: Colors.grey[600]),
          ],
        ),
      ),
    );
  }

  Widget _buildTextSheetFourItemRow(List<Widget> items) {
    assert(items.length == 4);
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          for (int i = 0; i < 4; i++)
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(left: i == 0 ? 0 : 3, right: i == 3 ? 0 : 3),
                child: items[i],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildTextSheetActionCell(
    String label,
    VoidCallback onTap, {
    bool compact = false,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: compact ? 30 : 40,
        padding: EdgeInsets.symmetric(horizontal: compact ? 4 : 4),
        decoration: BoxDecoration(
          color: Colors.grey[100],
          borderRadius: BorderRadius.circular(compact ? 6 : 8),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: 'Outfit',
                  fontSize: compact ? 10 : 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            Icon(
              Icons.chevron_right,
              size: compact ? 11 : 14,
              color: Colors.grey,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFormatToggle({
    required IconData icon,
    required bool isActive,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: isActive ? Colors.blue.withOpacity(0.1) : Colors.transparent,
          borderRadius: BorderRadius.circular(4),
        ),
        child: Icon(
          icon,
          color: isActive ? Colors.blue : Colors.black87,
          size: 24,
        ),
      ),
    );
  }

  void _showStickerBottomSheet() {
    _showManagedModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            final List<String> categories = [
              "Thank You",
              "Congratulations",
              "Greetings",
              "Good Morning",
              "Good Night",
              "Welcome",
              "Ayurveda",
              "Travel",
              "New Arrival",
              "Business",
              "Festival",
              "Discount",
              "Store Open",
              "Birthday",
              "Character",
              "Products",
            ];

            // Mock images for stickers. In a real app, these would come from an API/asset list
            // Using loremflickr with 'sticker' or 'icon' keyword + category
            final List<String> imageUrls = List.generate(
              12,
              (index) =>
                  "https://loremflickr.com/300/300/${_currentStickerCategory.replaceAll(' ', '')},sticker?lock=$index",
            );

            return Container(
              height: 600,
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        "Sticker",
                        style: TextStyle(
                          fontFamily: 'Outfit',
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Search Bar
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.grey[200],
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.search, color: Colors.grey),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            "Search by industry, product or service",
                            style: TextStyle(
                              fontFamily: 'Outfit',
                              color: Colors.grey,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Categories
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: categories.map((cat) {
                        final isSelected = cat == _currentStickerCategory;
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: GestureDetector(
                            onTap: () {
                              setSheetState(() {
                                _currentStickerCategory = cat;
                              });
                            },
                            child: Chip(
                              label: Text(cat),
                              backgroundColor: isSelected
                                  ? Colors.blue
                                  : Colors.grey[100],
                              labelStyle: TextStyle(
                                color: isSelected ? Colors.white : Colors.black,
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Grid
                  Expanded(
                    child: GridView.builder(
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 3,
                            crossAxisSpacing: 8,
                            mainAxisSpacing: 8,
                          ),
                      key: ValueKey(_currentStickerCategory), // Force rebuild
                      itemCount: imageUrls.length,
                      itemBuilder: (context, index) {
                        return GestureDetector(
                          onTap: () {
                            // Add sticker to canvas
                            setState(() {
                              String newId = DateTime.now()
                                  .millisecondsSinceEpoch
                                  .toString();
                              _canvasWidgets.add(
                                CanvasWidget(
                                  id: newId,
                                  type:
                                      CanvasWidgetType.logo, // Reuse Logo logic
                                  position: _getCenterOffset(100, 100),
                                  scale: 1.0,
                                  imagePath: imageUrls[index],
                                  zIndex: _nextZIndex,
                                ),
                              );
                              _selectedWidgetId = newId;
                            });
                            Navigator.pop(context);
                          },
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Image.network(
                              imageUrls[index],
                              fit: BoxFit.contain, // Contain for stickers
                              loadingBuilder:
                                  (context, child, loadingProgress) {
                                    if (loadingProgress == null) return child;
                                    return Center(
                                      child: CircularProgressIndicator(
                                        value:
                                            loadingProgress
                                                    .expectedTotalBytes !=
                                                null
                                            ? loadingProgress
                                                      .cumulativeBytesLoaded /
                                                  loadingProgress
                                                      .expectedTotalBytes!
                                            : null,
                                      ),
                                    );
                                  },
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildBottomTool({
    String? text,
    IconData? icon,
    required bool isActive,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isActive ? Colors.blue.withOpacity(0.1) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        child: text != null
            ? Text(
                text,
                style: TextStyle(
                  fontFamily: 'Outfit',
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: isActive ? Colors.blue : Colors.black87,
                ),
              )
            : Icon(
                icon,
                color: isActive ? Colors.blue : Colors.black87,
                size: 24,
              ),
      ),
    );
  }

  void _openFrameStore() async {
    final String canvasSizeSegment = _footerCanvasSizeSegment();
    if (canvasSizeSegment.isEmpty) return;

    final selectedFrame = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => FrameStoreScreen(
          selectedFrameUrl: _selectedFrame,
          canvasSizeSegment: canvasSizeSegment,
        ),
      ),
    );

    if (selectedFrame != null) {
      if (selectedFrame is String && selectedFrame == 'none') {
        setState(() {
          _selectedFrame = 'none';
          _selectedFrameJson = null;
          _canvasWidgets.removeWhere((w) => w.isFromFrame);
          if (_selectedWidgetId != null &&
              _selectedWidgetId!.startsWith('footer_')) {
            _selectedWidgetId = null;
          }
        });
      } else if (selectedFrame is FooterFrameMallItem) {
        final FooterFrameMallItem item = selectedFrame;
        final String templateId = item.id;
        if (templateId.isEmpty) return;

        Map<String, dynamic>? layout = _extractLayoutByAspectRatio(
          Map<String, dynamic>.from(item.raw),
        );
        layout ??= await _fetchTemplateLayoutById(templateId);

        if (!mounted) return;
        setState(() {
          if (item.previewUrl.isNotEmpty) {
            _selectedFrame = item.previewUrl;
          }
          if (layout != null) {
            _footerLayoutByTemplateId[templateId] = layout;
            _selectedFrameJson = layout;
          } else {
            _selectedFrameJson = _footerLayoutByTemplateId[templateId];
          }
        });
        _applyFooterLayout(_selectedFrameJson);
      } else if (selectedFrame is Template) {
        final String templateId = selectedFrame.id.toString();
        setState(() {
          _selectedFrame = selectedFrame.thumbnailUrl;
          _selectedFrameJson = _footerLayoutByTemplateId[templateId];
        });

        // If JSON not already fetched, fetch it now
        if (_selectedFrameJson == null) {
          final layout = await _fetchTemplateLayoutById(templateId);
          if (layout != null && mounted) {
            setState(() {
              _selectedFrameJson = layout;
              _footerLayoutByTemplateId[templateId] = layout;
            });
          }
        }
        _applyFooterLayout(_selectedFrameJson);
      }
    }
  }
}

class WarpedText extends StatelessWidget {
  final String text;
  final TextStyle style;
  final Map<String, dynamic> warp;
  final TextAlign textAlign;

  const WarpedText({
    super.key,
    required this.text,
    required this.style,
    required this.warp,
    this.textAlign = TextAlign.center,
  });

  @override
  Widget build(BuildContext context) {
    if (warp['style'] == 'arc') {
      return CustomPaint(
        painter: _ArcTextPainter(
          text: text,
          style: style,
          bend: (warp['value'] as num?)?.toDouble() ?? 0.0,
        ),
      );
    }
    return Text(text, style: style, textAlign: textAlign);
  }
}

class _ArcTextPainter extends CustomPainter {
  final String text;
  final TextStyle style;
  final double bend;

  _ArcTextPainter({
    required this.text,
    required this.style,
    required this.bend,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (text.isEmpty) return;

    final TextPainter textPainter = TextPainter(
      textDirection: TextDirection.ltr,
    );

    final List<TextPainter> charPainters = [];
    double totalWidth = 0;
    for (int i = 0; i < text.length; i++) {
      final tp = TextPainter(
        text: TextSpan(text: text[i], style: style),
        textDirection: TextDirection.ltr,
      )..layout();
      charPainters.add(tp);
      totalWidth += tp.width;
    }

    double bendAngle = (bend / 100.0) * pi;
    if (bendAngle.abs() < 0.01) {
      double x = (size.width - totalWidth) / 2;
      for (var tp in charPainters) {
        tp.paint(canvas, Offset(x, (size.height - tp.height) / 2));
        x += tp.width;
      }
      return;
    }

    double radius = totalWidth / bendAngle;
    canvas.save();

    double centerX = size.width / 2;
    double centerY = (bend > 0)
        ? (size.height / 2 + radius - 20)
        : (size.height / 2 - radius + 20);

    canvas.translate(centerX, centerY);

    double startAngle = (bend > 0)
        ? (-pi / 2 - bendAngle / 2)
        : (pi / 2 - bendAngle / 2);
    double currentAngle = startAngle;

    for (var tp in charPainters) {
      double charAngle = (tp.width / totalWidth) * bendAngle;
      double midAngle = currentAngle + charAngle / 2;

      double x = radius * cos(midAngle);
      double y = radius * sin(midAngle);

      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(midAngle + pi / 2);
      tp.paint(canvas, Offset(-tp.width / 2, -tp.height / 2));
      canvas.restore();

      currentAngle += charAngle;
    }

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _ArcTextPainter oldDelegate) =>
      oldDelegate.text != text ||
      oldDelegate.bend != bend ||
      oldDelegate.style != style;
}

/// Clips clipped child layers to a mask layer's bounds on the canvas.
class _LayerMaskClipper extends CustomClipper<Path> {
  const _LayerMaskClipper({
    required this.maskRect,
    required this.isEllipse,
    required this.borderRadius,
    this.cornerRadii,
  });

  final Rect maskRect;
  final bool isEllipse;
  final double borderRadius;
  final BorderRadius? cornerRadii;

  static Path buildMaskPath({
    required Rect maskRect,
    required bool isEllipse,
    double borderRadius = 0,
    BorderRadius? cornerRadii,
  }) {
    if (maskRect.isEmpty) {
      return Path();
    }
    if (isEllipse) {
      return Path()..addOval(maskRect);
    }
    if (cornerRadii != null) {
      return Path()
        ..addRRect(
          RRect.fromRectAndCorners(
            maskRect,
            topLeft: cornerRadii.topLeft,
            topRight: cornerRadii.topRight,
            bottomLeft: cornerRadii.bottomLeft,
            bottomRight: cornerRadii.bottomRight,
          ),
        );
    }
    if (borderRadius > 0) {
      return Path()
        ..addRRect(
          RRect.fromRectAndRadius(
            maskRect,
            Radius.circular(borderRadius),
          ),
        );
    }
    return Path()..addRect(maskRect);
  }

  @override
  Path getClip(Size size) {
    return buildMaskPath(
      maskRect: maskRect,
      isEllipse: isEllipse,
      borderRadius: borderRadius,
      cornerRadii: cornerRadii,
    );
  }

  @override
  bool shouldReclip(covariant _LayerMaskClipper oldClipper) {
    return oldClipper.maskRect != maskRect ||
        oldClipper.isEllipse != isEllipse ||
        oldClipper.borderRadius != borderRadius ||
        oldClipper.cornerRadii != cornerRadii;
  }
}

