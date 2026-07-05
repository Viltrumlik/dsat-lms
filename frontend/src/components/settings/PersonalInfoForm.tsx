// Domain: Academy (settings / CRM person layer)
// Description: A student's self-serve demographics editor — gender, birthday,
//   phone, address, school, grade. Reads/writes /students/me/. Lifecycle status
//   and guardians are staff-managed and not shown here.
'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { studentsAPI } from '@/lib/api/students'
import { parseApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/I18nProvider'
import { personalInfoSchema, type PersonalInfoValues } from '@/lib/validations/settings'

const FIELDS = ['gender', 'dateOfBirth', 'phone', 'address', 'school', 'grade'] as const
const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export function PersonalInfoForm() {
  const { toast } = useToast()
  const t = useT()
  const query = useQuery({
    queryKey: ['student', 'me', 'profile'],
    queryFn: studentsAPI.getMyProfile,
  })

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<PersonalInfoValues>({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: { gender: '', dateOfBirth: '', phone: '', address: '', school: '', grade: '' },
  })

  React.useEffect(() => {
    const p = query.data
    if (p) {
      reset({
        gender: p.gender ?? '',
        dateOfBirth: p.dateOfBirth ?? '',
        phone: p.phone ?? '',
        address: p.address ?? '',
        school: p.school ?? '',
        grade: p.grade ?? '',
      })
    }
  }, [query.data, reset])

  const onSubmit = async (values: PersonalInfoValues) => {
    try {
      await studentsAPI.updateMyProfile({
        gender: values.gender,
        dateOfBirth: values.dateOfBirth === '' ? null : values.dateOfBirth,
        phone: values.phone.trim(),
        address: values.address.trim(),
        school: values.school.trim(),
        grade: values.grade.trim(),
      })
      reset(values) // clear the dirty state
      toast({ variant: 'success', title: t('settings.personal.saved') })
    } catch (err) {
      const parsed = parseApiError(err)
      let mapped = false
      for (const [field, message] of Object.entries(parsed.fields)) {
        if ((FIELDS as readonly string[]).includes(field)) {
          setError(field as (typeof FIELDS)[number], { message })
          mapped = true
        }
      }
      if (!mapped) {
        toast({
          variant: 'error',
          title: t('settings.personal.saveFailed'),
          description: parsed.message,
        })
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.personal.title')}</CardTitle>
        <CardDescription>{t('settings.personal.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="phone">{t('settings.personal.phone')}</Label>
                <Input
                  id="phone"
                  autoComplete="tel"
                  aria-invalid={!!errors.phone}
                  {...register('phone')}
                />
                <FieldError message={errors.phone?.message} />
              </div>
              <div>
                <Label htmlFor="dateOfBirth">{t('settings.personal.dob')}</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  aria-invalid={!!errors.dateOfBirth}
                  {...register('dateOfBirth')}
                />
                <FieldError message={errors.dateOfBirth?.message} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="gender">{t('settings.personal.gender')}</Label>
                <select id="gender" className={SELECT_CLASS} {...register('gender')}>
                  <option value="">{t('settings.personal.genderUnset')}</option>
                  <option value="male">{t('settings.personal.male')}</option>
                  <option value="female">{t('settings.personal.female')}</option>
                  <option value="other">{t('settings.personal.other')}</option>
                </select>
              </div>
              <div>
                <Label htmlFor="grade">{t('settings.personal.grade')}</Label>
                <Input id="grade" aria-invalid={!!errors.grade} {...register('grade')} />
                <FieldError message={errors.grade?.message} />
              </div>
            </div>

            <div>
              <Label htmlFor="school">{t('settings.personal.school')}</Label>
              <Input id="school" aria-invalid={!!errors.school} {...register('school')} />
              <FieldError message={errors.school?.message} />
            </div>
            <div>
              <Label htmlFor="address">{t('settings.personal.address')}</Label>
              <Input id="address" aria-invalid={!!errors.address} {...register('address')} />
              <FieldError message={errors.address?.message} />
            </div>

            <div className="flex justify-end">
              <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
                {t('settings.personal.save')}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
