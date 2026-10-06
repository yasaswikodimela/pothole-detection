import 'package:geolocator/geolocator.dart';

class LocationService {
  static final LocationService instance = LocationService._internal();
  LocationService._internal();

  Position? _lastKnownPosition;
  bool _isGpsEnabled = false;

  bool get isGpsAvailable => _isGpsEnabled && _lastKnownPosition != null;
  Position? get currentPosition => _lastKnownPosition;

  Future<Position?> getCurrentLocation() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        _isGpsEnabled = false;
        return null;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          _isGpsEnabled = false;
          return null;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        _isGpsEnabled = false;
        return null;
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 4),
        ),
      );

      _lastKnownPosition = position;
      _isGpsEnabled = true;
      return position;
    } catch (e) {
      print('LocationService: GPS acquisition note: $e');
      _isGpsEnabled = false;
      return null;
    }
  }
}
