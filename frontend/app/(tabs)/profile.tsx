import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Alert, 
  Image,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState('');
  const [photo, setPhoto] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const response = await api.get('/auth/me');
      setName(response.data.name);
      setPhone(response.data.phone || '');
      setPhoto(response.data.photo || '');
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoadingProfile(false);
    }
  }

  async function pickImage() {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert('Permissão negada', 'Você precisa permitir acesso à galeria');
      return;
    }

    const result = await ImagePicker.launchImagePickerAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  }

  async function handleSave() {
    if (!name) {
      Alert.alert('Erro', 'Preencha o nome');
      return;
    }

    setLoading(true);
    try {
      await api.put('/auth/profile', {
        name,
        phone,
        photo,
      });

      Alert.alert('Sucesso', 'Perfil atualizado!');
      setIsEditing(false);
      loadProfile();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erro ao atualizar perfil';
      Alert.alert('Erro', message);
    } finally {
      setLoading(false);
    }
  }

  function handleSignOut() {
    Alert.alert(
      'Sair',
      'Tem certeza que deseja sair?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/auth/login');
          },
        },
      ]
    );
  }

  const roleLabel = user?.role === 'proprietario' ? 'Proprietário' : 'Corretor';

  if (loadingProfile) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Perfil</Text>
        {!isEditing && (
          <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.editButton}>
            <Ionicons name="pencil" size={24} color="#2196F3" />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.avatarContainer}>
            <TouchableOpacity 
              style={styles.avatarWrapper}
              onPress={isEditing ? pickImage : undefined}
              disabled={!isEditing}
            >
              {photo ? (
                <Image source={{ uri: photo }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={48} color="#2196F3" />
                </View>
              )}
              {isEditing && (
                <View style={styles.cameraButton}>
                  <Ionicons name="camera" size={20} color="#fff" />
                </View>
              )}
            </TouchableOpacity>

            {!isEditing && (
              <>
                <Text style={styles.name}>{name}</Text>
                <Text style={styles.email}>{user?.email}</Text>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{roleLabel}</Text>
                </View>
              </>
            )}
          </View>

          {isEditing ? (
            <View style={styles.editForm}>
              <Text style={styles.label}>Nome</Text>
              <TextInput
                style={styles.input}
                placeholder="Seu nome"
                value={name}
                onChangeText={setName}
                editable={!loading}
              />

              <Text style={styles.label}>Telefone</Text>
              <TextInput
                style={styles.input}
                placeholder="(00) 00000-0000"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                editable={!loading}
              />

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={user?.email}
                editable={false}
              />

              <View style={styles.editButtons}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => {
                    setIsEditing(false);
                    loadProfile();
                  }}
                  disabled={loading}
                >
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.saveButton, loading && styles.buttonDisabled]}
                  onPress={handleSave}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Salvar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Informações</Text>
              
              {phone && (
                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Ionicons name="call-outline" size={20} color="#666" />
                    <Text style={styles.infoLabel}>Telefone</Text>
                  </View>
                  <Text style={styles.infoValue}>{phone}</Text>
                </View>
              )}

              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <Ionicons name="mail-outline" size={20} color="#666" />
                  <Text style={styles.infoLabel}>Email</Text>
                </View>
                <Text style={styles.infoValue}>{user?.email}</Text>
              </View>

              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <Ionicons name="briefcase-outline" size={20} color="#666" />
                  <Text style={styles.infoLabel}>Tipo de Conta</Text>
                </View>
                <Text style={styles.infoValue}>{roleLabel}</Text>
              </View>
            </View>
          )}

          {!isEditing && (
            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={24} color="#F44336" />
              <Text style={styles.signOutText}>Sair</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  editButton: { padding: 8 },
  keyboardView: { flex: 1 },
  content: { padding: 16 },
  avatarContainer: { alignItems: 'center', paddingVertical: 32 },
  avatarWrapper: { position: 'relative', marginBottom: 16 },
  avatar: { width: 120, height: 120, borderRadius: 60 },
  avatarPlaceholder: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center' },
  cameraButton: { position: 'absolute', right: 0, bottom: 0, backgroundColor: '#2196F3', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff' },
  name: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  email: { fontSize: 16, color: '#666', marginBottom: 12 },
  roleBadge: { backgroundColor: '#2196F3', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  roleBadgeText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  section: { marginTop: 24, width: '100%' },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 16 },
  infoCard: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  infoLabel: { fontSize: 14, color: '#666', marginLeft: 8, fontWeight: '500' },
  infoValue: { fontSize: 16, color: '#333' },
  signOutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFEBEE', borderRadius: 12, padding: 16, marginTop: 32 },
  signOutText: { color: '#F44336', fontSize: 18, fontWeight: '600', marginLeft: 8 },
  editForm: { width: '100%', marginTop: 24 },
  label: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 8 },
  input: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, fontSize: 16, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 16 },
  inputDisabled: { backgroundColor: '#e0e0e0', color: '#999' },
  editButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  button: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center', minHeight: 56, justifyContent: 'center' },
  cancelButton: { backgroundColor: '#f5f5f5' },
  cancelButtonText: { color: '#666', fontSize: 16, fontWeight: '600' },
  saveButton: { backgroundColor: '#2196F3' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { backgroundColor: '#90CAF9' },
});
